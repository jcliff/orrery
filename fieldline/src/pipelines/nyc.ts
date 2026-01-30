import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const INPUT_PATH = new URL('../../data/raw/nyc/pluto.ndjson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/nyc', import.meta.url).pathname;

const GRID_SIZE = 0.0056; // ~560m grid cells for dense NYC

// BBL format: Borough (1 digit) + Block (5 digits) + Lot (4 digits)
// Use Borough + Block for neighborhood-level grouping
function getBlockId(bbl: string): string {
  const cleaned = bbl.replace(/[^0-9]/g, '');
  if (cleaned.length >= 6) {
    return cleaned.substring(0, 6); // Borough + Block
  }
  return cleaned || 'unknown';
}

function getClusterKey(bbl: string, lng: number, lat: number): string {
  const blockId = getBlockId(bbl);
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${blockId}:${gridLng.toFixed(4)},${gridLat.toFixed(4)}`;
}

interface RawRecord {
  bbl: string;
  yearbuilt: string;
  landuse: string;
  bldgclass: string;
  address: string;
  zipcode: string;
  borough: string;
  numfloors: string;
  unitsres: string;
  unitstotal: string;
  lotarea: string;
  bldgarea: string;
  assesstot: string;
  latitude: string;
  longitude: string;
}

const USE_COLORS: Record<string, string> = {
  'Single Family': '#3498db',
  'Multi-Family': '#9b59b6',
  'Commercial': '#e74c3c',
  'Industrial': '#7f8c8d',
  'Open Space': '#27ae60',
  'Public': '#2ecc71',
  'Mixed': '#1abc9c',
  'Unknown': '#95a5a6',
};

// NYC PLUTO land use codes (1-11, may be single or double digit)
function getUseCategory(landuse: string): string {
  const code = parseInt(landuse, 10);
  switch (code) {
    case 1: return 'Single Family';   // One & Two Family
    case 2: return 'Multi-Family';    // Multi-Family Walk-Up
    case 3: return 'Multi-Family';    // Multi-Family Elevator
    case 4: return 'Mixed';           // Mixed Residential & Commercial
    case 5: return 'Commercial';      // Commercial & Office
    case 6: return 'Industrial';      // Industrial & Manufacturing
    case 7: return 'Industrial';      // Transportation & Utility
    case 8: return 'Public';          // Public Facilities & Institutions
    case 9: return 'Open Space';      // Open Space & Recreation
    case 10: return 'Commercial';     // Parking Facilities
    case 11: return 'Open Space';     // Vacant Land
    default: return 'Unknown';
  }
}

function getUseColor(category: string): string {
  return USE_COLORS[category] || '#95a5a6';
}

interface Cluster {
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  totalArea: number;
  hasEstimates: boolean;
}

async function main() {
  console.log('Processing NYC PLUTO data...');

  try {
    await stat(INPUT_PATH);
  } catch {
    console.error(`Input file not found: ${INPUT_PATH}`);
    console.error('Run pipeline:nyc-fetch first');
    process.exit(1);
  }

  // First pass: analyze year coverage
  console.log('\nPass 1: Analyzing year coverage...');
  const yearsByUse: Record<string, number[]> = {};
  let totalCount = 0;
  let withYear = 0;
  let withoutYear = 0;

  const rl1 = createInterface({
    input: createReadStream(INPUT_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of rl1) {
    if (!line.trim()) continue;
    totalCount++;

    try {
      const record = JSON.parse(line) as RawRecord;
      const year = parseInt(record.yearbuilt, 10) || 0;
      const useCategory = getUseCategory(record.landuse);

      if (year && year >= 1700 && year <= 2025) {
        withYear++;
        if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
        yearsByUse[useCategory].push(year);
      } else {
        withoutYear++;
      }

      if (totalCount % 200000 === 0) {
        console.log(`  Analyzed ${totalCount.toLocaleString()} lots...`);
      }
    } catch {
      // Skip malformed lines
    }
  }

  console.log(`\nTotal lots: ${totalCount.toLocaleString()}`);
  console.log(`  With year: ${withYear.toLocaleString()} (${((withYear / totalCount) * 100).toFixed(1)}%)`);
  console.log(`  Without year: ${withoutYear.toLocaleString()}`);

  // Calculate medians
  const medianByUse: Record<string, number> = {};
  for (const [use, years] of Object.entries(yearsByUse)) {
    const sorted = [...years].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianByUse[use] = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  const allYears = Object.values(yearsByUse).flat();
  const sortedAll = [...allYears].sort((a, b) => a - b);
  const globalMedian = sortedAll[Math.floor(sortedAll.length / 2)] || 1920;

  console.log(`\nMedian years by use type:`);
  for (const [use, med] of Object.entries(medianByUse).sort((a, b) => a[1] - b[1])) {
    const count = yearsByUse[use]?.length || 0;
    console.log(`  ${use}: ${med} (${count.toLocaleString()} lots)`);
  }
  console.log(`  Global median: ${globalMedian}`);

  // Second pass: process and write output
  console.log('\nPass 2: Processing and clustering...');

  await mkdir(OUTPUT_DIR, { recursive: true });

  const clusters: Map<string, Cluster> = new Map();
  let minYear = 9999;
  let maxYear = 0;
  let processed = 0;
  let skipped = 0;

  const detailedPath = `${OUTPUT_DIR}/lots-detailed.ndjson`;
  const detailedStream = createWriteStream(detailedPath);

  const rl2 = createInterface({
    input: createReadStream(INPUT_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of rl2) {
    if (!line.trim()) continue;

    try {
      const record = JSON.parse(line) as RawRecord;
      const { bbl, yearbuilt, landuse, address, bldgarea, latitude, longitude } = record;

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        skipped++;
        continue;
      }

      const yearNum = parseInt(yearbuilt, 10) || 0;
      const hasKnownYear = yearNum >= 1700 && yearNum <= 2025;
      const useCategory = getUseCategory(landuse);
      const year = hasKnownYear ? yearNum : (medianByUse[useCategory] || globalMedian);
      const estimated = !hasKnownYear;

      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;

      const startTime = `${year}-01-01T00:00:00Z`;
      const color = getUseColor(useCategory);
      const area = parseFloat(bldgarea) || 0;

      // Write detailed feature
      const detailedFeature = {
        type: 'Feature',
        properties: {
          bbl,
          year,
          estimated,
          use: useCategory,
          address: address || '',
          area,
          startTime,
          color,
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      };
      detailedStream.write(JSON.stringify(detailedFeature) + '\n');

      // Clustering
      const clusterKey = getClusterKey(bbl, lng, lat);

      let cluster = clusters.get(clusterKey);
      if (!cluster) {
        cluster = {
          lngSum: 0,
          latSum: 0,
          count: 0,
          useTypes: {},
          earliestYear: year,
          totalArea: 0,
          hasEstimates: false,
        };
        clusters.set(clusterKey, cluster);
      }

      cluster.lngSum += lng;
      cluster.latSum += lat;
      cluster.count++;
      cluster.useTypes[useCategory] = (cluster.useTypes[useCategory] || 0) + 1;
      cluster.totalArea += area;
      if (year < cluster.earliestYear) cluster.earliestYear = year;
      if (estimated) cluster.hasEstimates = true;

      processed++;
      if (processed % 200000 === 0) {
        console.log(`  Processed ${processed.toLocaleString()} lots, ${clusters.size.toLocaleString()} clusters...`);
      }
    } catch {
      skipped++;
    }
  }

  await new Promise<void>((resolve, reject) => {
    detailedStream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`\nProcessed ${processed.toLocaleString()} lots into ${clusters.size.toLocaleString()} clusters`);
  if (skipped > 0) console.log(`Skipped ${skipped.toLocaleString()} lots without coordinates`);
  console.log(`Year range: ${minYear} - ${maxYear}`);

  // Build and write aggregated features
  console.log('\nWriting aggregated clusters...');

  interface AggFeature {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: number[] };
  }

  const aggregatedFeatures: AggFeature[] = [];

  for (const cluster of clusters.values()) {
    let dominantUse = 'Unknown';
    let maxCount = 0;
    for (const [use, count] of Object.entries(cluster.useTypes)) {
      if (count > maxCount) {
        maxCount = count;
        dominantUse = use;
      }
    }

    const centroidLng = cluster.lngSum / cluster.count;
    const centroidLat = cluster.latSum / cluster.count;
    const startTime = `${cluster.earliestYear}-01-01T00:00:00Z`;

    aggregatedFeatures.push({
      type: 'Feature',
      properties: {
        year: cluster.earliestYear,
        use: dominantUse,
        count: cluster.count,
        area: Math.round(cluster.totalArea),
        estimated: cluster.hasEstimates,
        startTime,
        color: getUseColor(dominantUse),
      },
      geometry: {
        type: 'Point',
        coordinates: [centroidLng, centroidLat],
      },
    });
  }

  // Sort by year
  aggregatedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));

  const aggregatedPath = `${OUTPUT_DIR}/lots.geojson`;
  const aggregatedStream = createWriteStream(aggregatedPath);
  aggregatedStream.write('{"type":"FeatureCollection","features":[\n');

  for (let i = 0; i < aggregatedFeatures.length; i++) {
    const suffix = i < aggregatedFeatures.length - 1 ? ',\n' : '\n';
    aggregatedStream.write(JSON.stringify(aggregatedFeatures[i]) + suffix);
  }

  aggregatedStream.write(']}');

  await new Promise<void>((resolve, reject) => {
    aggregatedStream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`\nWrote ${aggregatedPath} (${aggregatedFeatures.length.toLocaleString()} clusters)`);
  console.log(`Wrote ${detailedPath} (${processed.toLocaleString()} lots as NDJSON)`);
  console.log(`\nDone! Year range for timeline: ${minYear}-${maxYear}`);
}

main().catch(console.error);
