import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const INPUT_PATH = new URL('../../data/raw/paris/buildings.ndjson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/paris', import.meta.url).pathname;

const GRID_SIZE = 0.003; // ~300m grid cells for dense Paris

function getClusterKey(objectId: number, lng: number, lat: number): string {
  // Use grid only for Paris (no block structure in data)
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(4)},${gridLat.toFixed(4)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    OBJECTID: number;
    an_const: number | null;      // Year of construction
    c_perconst: number | null;    // Construction period code (1-12, 99)
    an_rehab: number | null;      // Year of rehabilitation
    h_moy: number | null;         // Average height
    c_morpho: number | null;      // Morphology code
    c_tissu: string | null;       // Urban fabric code
    Shape_Area: number | null;
  };
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][] | number[][][][];
  };
}

const USE_COLORS: Record<string, string> = {
  'Residential': '#3498db',
  'Commercial': '#e74c3c',
  'Industrial': '#7f8c8d',
  'Public': '#27ae60',
  'Mixed': '#1abc9c',
  'Unknown': '#95a5a6',
};

// C_PERCONST period codes to midpoint year
const PERIOD_TO_YEAR: Record<number, number> = {
  1: 1750,   // Avant 1800
  2: 1825,   // 1801-1850
  3: 1880,   // 1851-1914
  5: 1927,   // 1915-1939
  6: 1953,   // 1940-1967
  7: 1971,   // 1968-1975
  8: 1978,   // 1976-1981
  9: 1985,   // 1982-1989
  10: 1994,  // 1990-1999
  11: 2003,  // 2000-2007
  12: 2015,  // 2008+
  99: 1900,  // Non-date (use global median)
};

// c_morpho codes to use category (simplified)
// Based on APUR building morphology classification
function getUseCategory(cMorpho: number | null, cTissu: string | null): string {
  // c_morpho codes are numeric, representing building types
  // Without full documentation, we'll use reasonable defaults
  if (!cMorpho) return 'Unknown';
  // Most Paris buildings are residential
  return 'Residential';
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
    if (!ring || ring.length === 0) return null;
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
      if (poly[0]) {
        for (const [lng, lat] of poly[0]) {
          sumLng += lng;
          sumLat += lat;
          count++;
        }
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
  totalArea: number;
  hasEstimates: boolean;
}

async function main() {
  console.log('Processing Paris APUR building data...');

  try {
    await stat(INPUT_PATH);
  } catch {
    console.error(`Input file not found: ${INPUT_PATH}`);
    console.error('Run pipeline:paris-fetch first');
    process.exit(1);
  }

  // First pass: analyze year coverage
  console.log('\nPass 1: Analyzing year coverage...');
  const yearsByUse: Record<string, number[]> = {};
  let totalCount = 0;
  let withYear = 0;
  let withPeriod = 0;
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
      const year = feature.properties.an_const;
      const period = feature.properties.c_perconst;
      const useCategory = getUseCategory(feature.properties.c_morpho, feature.properties.c_tissu);

      if (year && year >= 1400 && year <= 2025) {
        withYear++;
        if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
        yearsByUse[useCategory].push(year);
      } else if (period && PERIOD_TO_YEAR[period]) {
        withPeriod++;
        const estimatedYear = PERIOD_TO_YEAR[period];
        if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
        yearsByUse[useCategory].push(estimatedYear);
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
  console.log(`  With exact year: ${withYear.toLocaleString()} (${((withYear / totalCount) * 100).toFixed(1)}%)`);
  console.log(`  With period: ${withPeriod.toLocaleString()} (${((withPeriod / totalCount) * 100).toFixed(1)}%)`);
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
      const { OBJECTID, an_const, c_perconst, c_morpho, c_tissu, Shape_Area, h_moy } = feature.properties;

      const centroid = getCentroid(feature.geometry);
      if (!centroid) {
        skipped++;
        continue;
      }
      const [lng, lat] = centroid;

      // Determine year
      let year: number;
      let estimated: boolean;
      if (an_const && an_const >= 1400 && an_const <= 2025) {
        year = an_const;
        estimated = false;
      } else if (c_perconst && PERIOD_TO_YEAR[c_perconst]) {
        year = PERIOD_TO_YEAR[c_perconst];
        estimated = true;
      } else {
        const useCategory = getUseCategory(c_morpho, c_tissu);
        year = medianByUse[useCategory] || globalMedian;
        estimated = true;
      }

      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;

      const useCategory = getUseCategory(c_morpho, c_tissu);
      const startTime = `${year}-01-01T00:00:00Z`;
      const color = getUseColor(useCategory);
      const area = Shape_Area || 0;

      // Write detailed feature
      const detailedFeature = {
        type: 'Feature',
        properties: {
          id: OBJECTID,
          year,
          estimated,
          use: useCategory,
          height: h_moy || null,
          area: Math.round(area),
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
      const clusterKey = getClusterKey(OBJECTID, lng, lat);

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
