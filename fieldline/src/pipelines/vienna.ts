import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const INPUT_PATH = new URL('../../data/raw/vienna/buildings.ndjson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/vienna', import.meta.url).pathname;

const GRID_SIZE = 0.003; // ~300m grid cells for dense Vienna

function getClusterKey(id: string, lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(4)},${gridLat.toFixed(4)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    OBJECTID?: number;
    BAUJAHR?: number;        // Construction year (direct!)
    L_BAUJ?: string;         // Construction year text (e.g., "1900-1910")
    L_NUTZUNG?: string;      // Usage type text
    L_BAUTYP?: string;       // Building type text
    GESCH_ANZ?: number;      // Number of floors
    BEZ?: string;            // District
    STRNAML?: string;        // Street name
    VONN?: number;           // House number from
    ARCHITEKT?: string;      // Architect
    [key: string]: unknown;
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
  'Office': '#e67e22',
  'Mixed': '#1abc9c',
  'Public': '#27ae60',
  'Unknown': '#95a5a6',
};

// Vienna L_BAUJ (construction year text) to year mapping
// Format can be "1900", "1900-1910", "vor 1848", etc.
function getYearFromText(text: string | undefined): number | null {
  if (!text) return null;

  // Try to extract a 4-digit year
  const yearMatch = text.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1400 && year <= 2025) {
      return year;
    }
  }

  // Handle period text
  const textLower = text.toLowerCase();
  if (textLower.includes('vor 1848') || textLower.includes('bis 1848')) return 1750;
  if (textLower.includes('1848') && textLower.includes('1918')) return 1883;
  if (textLower.includes('1919') && textLower.includes('1944')) return 1931;

  return null;
}

// Vienna usage (L_NUTZUNG) mapping to categories
function getUseCategory(nutzung: string | undefined, bautyp: string | undefined): string {
  const use = (nutzung || '').toLowerCase();
  const typ = (bautyp || '').toLowerCase();

  if (!use && !typ) return 'Unknown';

  // Check usage first
  if (use.includes('wohn') || use.includes('residential')) return 'Residential';
  if (use.includes('gewerbe') || use.includes('geschäft') || use.includes('handel')) return 'Commercial';
  if (use.includes('büro') || use.includes('office')) return 'Office';
  if (use.includes('industrie') || use.includes('lager')) return 'Industrial';
  if (use.includes('öffentlich') || use.includes('verwaltung') || use.includes('kultur') ||
      use.includes('bildung') || use.includes('schule') || use.includes('kirche')) return 'Public';
  if (use.includes('misch') || use.includes('gemischt')) return 'Mixed';

  // Check building type
  if (typ.includes('wohn')) return 'Residential';
  if (typ.includes('gewerbe') || typ.includes('geschäft')) return 'Commercial';
  if (typ.includes('industrie')) return 'Industrial';
  if (typ.includes('öffentlich') || typ.includes('kirche') || typ.includes('schule')) return 'Public';

  // Default to residential for Vienna
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
  totalFloors: number;
  hasEstimates: boolean;
}

async function main() {
  console.log('Processing Vienna building data...');

  try {
    await stat(INPUT_PATH);
  } catch {
    console.error(`Input file not found: ${INPUT_PATH}`);
    console.error('Run pipeline:vienna-fetch first');
    process.exit(1);
  }

  // First pass: analyze year coverage
  console.log('\nPass 1: Analyzing year coverage...');
  const yearsByUse: Record<string, number[]> = {};
  let totalCount = 0;
  let withYear = 0;
  let withTextYear = 0;
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
      const directYear = feature.properties.BAUJAHR;
      const textYear = feature.properties.L_BAUJ;
      const useCategory = getUseCategory(feature.properties.L_NUTZUNG, feature.properties.L_BAUTYP);

      let year: number | null = null;

      // Prefer direct year
      if (directYear && directYear >= 1400 && directYear <= 2025) {
        year = directYear;
        withYear++;
      } else {
        // Try text year
        year = getYearFromText(textYear);
        if (year) {
          withTextYear++;
        } else {
          withoutYear++;
        }
      }

      if (year) {
        if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
        yearsByUse[useCategory].push(year);
      }

      if (totalCount % 20000 === 0) {
        console.log(`  Analyzed ${totalCount.toLocaleString()} buildings...`);
      }
    } catch {
      // Skip malformed lines
    }
  }

  console.log(`\nTotal buildings: ${totalCount.toLocaleString()}`);
  console.log(`  With direct year: ${withYear.toLocaleString()} (${((withYear / totalCount) * 100).toFixed(1)}%)`);
  console.log(`  With text year: ${withTextYear.toLocaleString()} (${((withTextYear / totalCount) * 100).toFixed(1)}%)`);
  console.log(`  Without year: ${withoutYear.toLocaleString()}`);
  console.log(`  Total with year: ${(((withYear + withTextYear) / totalCount) * 100).toFixed(1)}%`);

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
      const props = feature.properties;
      const id = (props.OBJECTID || `unknown-${processed}`).toString();
      const directYear = props.BAUJAHR;
      const textYear = props.L_BAUJ;
      const floors = props.GESCH_ANZ || 1;

      const centroid = getCentroid(feature.geometry);
      if (!centroid) {
        skipped++;
        continue;
      }
      const [lng, lat] = centroid;

      // Determine year
      const useCategory = getUseCategory(props.L_NUTZUNG, props.L_BAUTYP);

      let year: number;
      let estimated: boolean;
      if (directYear && directYear >= 1400 && directYear <= 2025) {
        year = directYear;
        estimated = false;
      } else {
        const textYearValue = getYearFromText(textYear);
        if (textYearValue) {
          year = textYearValue;
          estimated = true;
        } else {
          year = medianByUse[useCategory] || globalMedian;
          estimated = true;
        }
      }

      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;

      const startTime = `${year}-01-01T00:00:00Z`;
      const color = getUseColor(useCategory);

      // Write detailed feature
      const detailedFeature = {
        type: 'Feature',
        properties: {
          id,
          year,
          estimated,
          use: useCategory,
          floors,
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
      const clusterKey = getClusterKey(id, lng, lat);

      let cluster = clusters.get(clusterKey);
      if (!cluster) {
        cluster = {
          lngSum: 0,
          latSum: 0,
          count: 0,
          useTypes: {},
          earliestYear: year,
          totalFloors: 0,
          hasEstimates: false,
        };
        clusters.set(clusterKey, cluster);
      }

      cluster.lngSum += lng;
      cluster.latSum += lat;
      cluster.count++;
      cluster.useTypes[useCategory] = (cluster.useTypes[useCategory] || 0) + 1;
      cluster.totalFloors += floors;
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
        floors: cluster.totalFloors,
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
