import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const INPUT_PATH = new URL('../../data/raw/amsterdam/buildings.ndjson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/amsterdam', import.meta.url).pathname;

const GRID_SIZE = 0.004; // ~400m grid cells for dense Amsterdam

// Dutch BAG building data uses 'identificatie' as unique ID
// First 4 digits are municipality code (e.g., 0363 = Amsterdam)
function getDistrictCode(identificatie: string): string {
  // identificatie format: municipality(4) + building(12)
  // Use first 8 digits for district-level grouping
  if (identificatie && identificatie.length >= 8) {
    return identificatie.substring(0, 8);
  }
  return 'unknown';
}

function getClusterKey(identificatie: string, lng: number, lat: number): string {
  const districtCode = getDistrictCode(identificatie);
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${districtCode}:${gridLng.toFixed(4)},${gridLat.toFixed(4)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    identificatie: string;
    bouwjaar: number;
    status: string;
    gebruiksdoel?: string;
    aantal_verblijfsobjecten?: number;
  };
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
}

const USE_COLORS: Record<string, string> = {
  'Residential': '#3498db',
  'Commercial': '#e74c3c',
  'Industrial': '#7f8c8d',
  'Office': '#e67e22',
  'Mixed': '#1abc9c',
  'Public': '#27ae60',
  'Unknown': '#95a5a6',
};

// Dutch BAG gebruiksdoel (intended use) mapping
function getUseCategory(gebruiksdoel: string | undefined): string {
  if (!gebruiksdoel) return 'Unknown';
  const use = gebruiksdoel.toLowerCase();
  if (use.includes('woon')) return 'Residential';  // woonfunctie
  if (use.includes('winkel') || use.includes('horeca')) return 'Commercial';
  if (use.includes('kantoor')) return 'Office';
  if (use.includes('industrie') || use.includes('overig')) return 'Industrial';
  if (use.includes('bijeenkomst') || use.includes('onderwijs') || use.includes('gezondheid')) return 'Public';
  if (use.includes('logies')) return 'Commercial'; // hotel
  return 'Unknown';
}

function getUseColor(category: string): string {
  return USE_COLORS[category] || '#95a5a6';
}

// Get centroid from polygon geometry
function getCentroid(geometry: RawFeature['geometry']): [number, number] | null {
  if (geometry.type === 'Point') {
    return geometry.coordinates as [number, number];
  }

  if (geometry.type === 'Polygon') {
    const ring = (geometry.coordinates as number[][][])[0];
    let sumLng = 0, sumLat = 0;
    for (const [lng, lat] of ring) {
      sumLng += lng;
      sumLat += lat;
    }
    return [sumLng / ring.length, sumLat / ring.length];
  }

  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    let sumLng = 0, sumLat = 0, count = 0;
    for (const poly of polys) {
      for (const [lng, lat] of poly[0]) {
        sumLng += lng;
        sumLat += lat;
        count++;
      }
    }
    return count > 0 ? [sumLng / count, sumLat / count] : null;
  }

  return null;
}

interface Cluster {
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  totalUnits: number;
  hasEstimates: boolean;
}

async function main() {
  console.log('Processing Amsterdam BAG building data...');

  try {
    await stat(INPUT_PATH);
  } catch {
    console.error(`Input file not found: ${INPUT_PATH}`);
    console.error('Run pipeline:amsterdam-fetch first');
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
      const feature = JSON.parse(line) as RawFeature;
      const year = feature.properties.bouwjaar;
      const useCategory = getUseCategory(feature.properties.gebruiksdoel);

      // BAG uses 1005 for unknown year (before 1005) and 9999 for planned
      if (year && year >= 1400 && year <= 2025) {
        withYear++;
        if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
        yearsByUse[useCategory].push(year);
      } else {
        withoutYear++;
      }

      if (totalCount % 50000 === 0) {
        console.log(`  Analyzed ${totalCount.toLocaleString()} buildings...`);
      }
    } catch {
      // Skip malformed lines
    }
  }

  console.log(`\nTotal buildings: ${totalCount.toLocaleString()}`);
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
  const globalMedian = sortedAll[Math.floor(sortedAll.length / 2)] || 1900;

  console.log(`\nMedian years by use type:`);
  for (const [use, med] of Object.entries(medianByUse).sort((a, b) => a[1] - b[1])) {
    const count = yearsByUse[use]?.length || 0;
    console.log(`  ${use}: ${med} (${count.toLocaleString()} buildings)`);
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

  const detailedPath = `${OUTPUT_DIR}/buildings-detailed.ndjson`;
  const detailedStream = createWriteStream(detailedPath);

  const rl2 = createInterface({
    input: createReadStream(INPUT_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of rl2) {
    if (!line.trim()) continue;

    try {
      const feature = JSON.parse(line) as RawFeature;
      const { identificatie, bouwjaar, gebruiksdoel, aantal_verblijfsobjecten } = feature.properties;

      const centroid = getCentroid(feature.geometry);
      if (!centroid) {
        skipped++;
        continue;
      }
      const [lng, lat] = centroid;

      const hasKnownYear = bouwjaar && bouwjaar >= 1400 && bouwjaar <= 2025;
      const useCategory = getUseCategory(gebruiksdoel);
      const year = hasKnownYear ? bouwjaar : (medianByUse[useCategory] || globalMedian);
      const estimated = !hasKnownYear;

      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;

      const startTime = `${year}-01-01T00:00:00Z`;
      const color = getUseColor(useCategory);
      const units = aantal_verblijfsobjecten || 1;

      // Write detailed feature
      const detailedFeature = {
        type: 'Feature',
        properties: {
          id: identificatie,
          year,
          estimated,
          use: useCategory,
          units,
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
      const clusterKey = getClusterKey(identificatie, lng, lat);

      let cluster = clusters.get(clusterKey);
      if (!cluster) {
        cluster = {
          lngSum: 0,
          latSum: 0,
          count: 0,
          useTypes: {},
          earliestYear: year,
          totalUnits: 0,
          hasEstimates: false,
        };
        clusters.set(clusterKey, cluster);
      }

      cluster.lngSum += lng;
      cluster.latSum += lat;
      cluster.count++;
      cluster.useTypes[useCategory] = (cluster.useTypes[useCategory] || 0) + 1;
      cluster.totalUnits += units;
      if (year < cluster.earliestYear) cluster.earliestYear = year;
      if (estimated) cluster.hasEstimates = true;

      processed++;
      if (processed % 50000 === 0) {
        console.log(`  Processed ${processed.toLocaleString()} buildings, ${clusters.size.toLocaleString()} clusters...`);
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

  console.log(`\nProcessed ${processed.toLocaleString()} buildings into ${clusters.size.toLocaleString()} clusters`);
  if (skipped > 0) console.log(`Skipped ${skipped.toLocaleString()} buildings without geometry`);
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
        units: cluster.totalUnits,
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

  const aggregatedPath = `${OUTPUT_DIR}/buildings.geojson`;
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
  console.log(`Wrote ${detailedPath} (${processed.toLocaleString()} buildings as NDJSON)`);
  console.log(`\nDone! Year range for timeline: ${minYear}-${maxYear}`);
}

main().catch(console.error);
