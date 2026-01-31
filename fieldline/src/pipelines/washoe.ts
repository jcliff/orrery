import { readFile, writeFile, mkdir } from 'node:fs/promises';

const INPUT_PATH = new URL('../../data/raw/washoe/parcels.geojson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/washoe', import.meta.url).pathname;

// Grid cell size for aggregation (~50m at Reno latitude)
const GRID_SIZE = 0.0005;

// Extract block ID from APN (first segment before -)
function getBlockId(apn: string | number | null): string {
  if (apn === null || apn === undefined) return 'unknown';
  const str = String(apn);
  const parts = str.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return str.substring(0, 6);
}

// Get grid cell key from coordinates
function getGridKey(lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

// Composite key: block + grid cell
function getClusterKey(apn: string | number | null, lng: number, lat: number): string {
  return `${getBlockId(apn)}:${getGridKey(lng, lat)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    APN: string | number | null;
    YEARBLT: number | null;
    AVCONSYEAR: number | null;
    LAND_USE: string | null;
    FullAddress: string | null;
    CITY: string | null;
    SQFEET: number | null;
    ACREAGE: number | null;
    BUILDINGTYPE: string | null;
    STORIES: number | null;
    UNITS: number | null;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

// Nevada Assessor Land Use Codes - numeric codes to colors
// See: https://tax.nv.gov/wp-content/uploads/2024/06/2017-18_Land_Use_Code_Manual.pdf
// 10-19 = Vacant, 20-29 = Residential, 30-39 = Commercial, 40-49 = Industrial
// 50-59 = Industrial (general/commercial), 60-69 = Rural/Agricultural
const USE_COLORS: Record<string, string> = {
  // Residential (200s = LUC 20-29)
  '200': '#3498db',    // Single Family Residential
  '210': '#9b59b6',    // Duplex/Multi-Family
  '220': '#8e44ad',    // Apartments
  '230': '#9b59b6',    // Townhouse/Condo
  '240': '#a569bd',    // Condo
  '250': '#e67e22',    // Mobile Home
  // Vacant (100s = LUC 10-19)
  '100': '#bdc3c7',
  '110': '#bdc3c7',
  '120': '#bdc3c7',
  '170': '#bdc3c7',
  '190': '#bdc3c7',
  // Commercial (300s = LUC 30-39)
  '300': '#e74c3c',    // General Commercial
  '310': '#e74c3c',    // Retail
  '320': '#e67e22',    // Office
  '330': '#f39c12',    // Hotel/Motel
  '340': '#d63031',    // Casino/Gaming
  '350': '#e74c3c',    // Shopping Center
  // Industrial (400s = LUC 40-49)
  '400': '#7f8c8d',    // General Industrial
  '410': '#7f8c8d',    // Light Industrial
  '420': '#7f8c8d',    // Heavy Industrial
  '430': '#95a5a6',    // Warehouse
  '440': '#7f8c8d',    // Manufacturing
  // Industrial (500s = LUC 50-59) - General & Commercial Industrial
  '500': '#7f8c8d',    // General Industrial
  '510': '#95a5a6',    // Commercial Industrial (warehouses, distribution)
  '520': '#7f8c8d',    // Industrial
  // Agricultural/Rural (600s = LUC 60-69)
  '600': '#27ae60',    // Agricultural
  '670': '#27ae60',    // Ranch/Rural
  // Mining (700s)
  '700': '#95a5a6',
  '710': '#95a5a6',
  // Government/Public (800s if they exist)
  '800': '#2ecc71',
  '810': '#2ecc71',
};

// Nevada Assessor Land Use Codes - numeric codes to labels
const USE_LABELS: Record<string, string> = {
  // Residential
  '200': 'Single Family',
  '210': 'Multi-Family',
  '220': 'Apartments',
  '230': 'Townhouse',
  '240': 'Condo',
  '250': 'Mobile Home',
  // Vacant
  '100': 'Vacant',
  '110': 'Vacant',
  '120': 'Vacant',
  '170': 'Vacant',
  '190': 'Vacant',
  // Commercial
  '300': 'Commercial',
  '310': 'Retail',
  '320': 'Office',
  '330': 'Hotel',
  '340': 'Casino',
  '350': 'Shopping Center',
  // Industrial (400s)
  '400': 'Industrial',
  '410': 'Light Industrial',
  '420': 'Heavy Industrial',
  '430': 'Warehouse',
  '440': 'Manufacturing',
  // Industrial (500s) - General & Commercial Industrial
  '500': 'Industrial',
  '510': 'Warehouse/Distribution',
  '520': 'Industrial',
  // Agricultural
  '600': 'Agricultural',
  '670': 'Ranch',
  // Mining
  '700': 'Mining',
  '710': 'Mining',
  // Government (800s if they exist)
  '800': 'Government',
  '810': 'Government',
};

function getUseColor(use: string | null): string {
  if (!use) return '#95a5a6';
  // Handle comma-separated codes like "200, 600" - use first code
  const code = String(use).split(',')[0].trim();
  if (USE_COLORS[code]) return USE_COLORS[code];
  // Try prefix match (e.g., "200" matches "2xx" residential)
  const prefix = code.charAt(0);
  const prefixColors: Record<string, string> = {
    '1': '#bdc3c7', // Vacant
    '2': '#3498db', // Residential
    '3': '#e74c3c', // Commercial
    '4': '#7f8c8d', // Industrial
    '5': '#7f8c8d', // Industrial (general/commercial)
    '6': '#27ae60', // Agricultural
    '7': '#95a5a6', // Mining
    '8': '#2ecc71', // Government
  };
  return prefixColors[prefix] || '#95a5a6';
}

function getUseLabel(use: string | null): string {
  if (!use) return 'Unknown';
  // Handle comma-separated codes like "200, 600" - use first code
  const code = String(use).split(',')[0].trim();
  if (USE_LABELS[code]) return USE_LABELS[code];
  // Fallback to category based on first digit
  const prefix = code.charAt(0);
  const prefixLabels: Record<string, string> = {
    '1': 'Vacant',
    '2': 'Residential',
    '3': 'Commercial',
    '4': 'Industrial',
    '5': 'Industrial',
    '6': 'Agricultural',
    '7': 'Mining',
    '8': 'Government',
  };
  return prefixLabels[prefix] || 'Unknown';
}

// Color lookup by label (for aggregated features)
const LABEL_COLORS: Record<string, string> = {
  'Single Family': '#3498db',
  'Multi-Family': '#9b59b6',
  'Townhouse': '#9b59b6',
  'Condo': '#a569bd',
  'Commercial': '#e74c3c',
  'Retail': '#e74c3c',
  'Office': '#e67e22',
  'Industrial': '#7f8c8d',
  'Hotel': '#f39c12',
  'Casino': '#d63031',
  'Vacant': '#bdc3c7',
  'Agricultural': '#27ae60',
  'Government': '#2ecc71',
  'Religious': '#16a085',
  'Mixed Use': '#1abc9c',
  'Mobile Home': '#e74c3c',
};

function getLabelColor(label: string): string {
  return LABEL_COLORS[label] || '#95a5a6';
}

// Calculate centroid of a polygon
function getCentroid(geometry: RawFeature['geometry']): [number, number] {
  let coords: number[][][];

  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates as number[][][];
  } else {
    // MultiPolygon - use first polygon
    coords = (geometry.coordinates as number[][][][])[0];
  }

  // Use outer ring only
  const ring = coords[0];
  let sumLng = 0;
  let sumLat = 0;

  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }

  return [sumLng / ring.length, sumLat / ring.length];
}

interface Cluster {
  blockId: string;
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  totalArea: number;
  hasEstimates: boolean;
}

async function main() {
  console.log('Processing Washoe County parcel data...');

  // Read raw data
  const content = await readFile(INPUT_PATH, 'utf-8');
  const raw = JSON.parse(content) as { type: string; features: RawFeature[] };

  console.log(`Loaded ${raw.features.length} parcels`);

  // First pass: collect stats
  let withYear = 0;
  let withoutYear = 0;
  const yearsByUse: Record<string, number[]> = {};

  for (const feature of raw.features) {
    const year = feature.properties.YEARBLT || feature.properties.AVCONSYEAR;
    const use = feature.properties.LAND_USE || 'Unknown';

    if (year && year >= 1800 && year <= 2025) {
      withYear++;
      if (!yearsByUse[use]) yearsByUse[use] = [];
      yearsByUse[use].push(year);
    } else {
      withoutYear++;
    }
  }

  console.log(`\nYear data coverage:`);
  console.log(`  With year: ${withYear.toLocaleString()} (${((withYear / raw.features.length) * 100).toFixed(1)}%)`);
  console.log(`  Without year: ${withoutYear.toLocaleString()}`);

  // Calculate median year by use type for estimation
  const medianByUse: Record<string, number> = {};
  for (const [use, years] of Object.entries(yearsByUse)) {
    const sorted = [...years].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianByUse[use] = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  // Global median for fallback
  const allYears = Object.values(yearsByUse).flat();
  const sortedAll = [...allYears].sort((a, b) => a - b);
  const globalMedian = sortedAll[Math.floor(sortedAll.length / 2)] || 1970;

  console.log(`\nMedian years by use type (top 5):`);
  const sortedUses = Object.entries(medianByUse).sort((a, b) => a[1] - b[1]).slice(0, 5);
  for (const [use, med] of sortedUses) {
    console.log(`  ${getUseLabel(use)}: ${med}`);
  }
  console.log(`  Global median: ${globalMedian}`);

  // Second pass: create detailed features and clusters
  const detailedFeatures: GeoJSONFeature[] = [];
  const clusters: Map<string, Cluster> = new Map();
  let minYear = 9999;
  let maxYear = 0;

  for (const feature of raw.features) {
    const { APN, YEARBLT, AVCONSYEAR, LAND_USE, FullAddress, SQFEET } = feature.properties;

    // Skip parcels without geometry
    if (!feature.geometry) continue;

    // Determine year
    const rawYear = YEARBLT || AVCONSYEAR;
    const hasKnownYear = rawYear && rawYear >= 1800 && rawYear <= 2025;
    const use = LAND_USE || 'Unknown';
    const year = hasKnownYear
      ? rawYear
      : (medianByUse[use] || globalMedian);
    const estimated = !hasKnownYear;

    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;

    const startTime = `${year}-01-01T00:00:00Z`;
    const color = getUseColor(LAND_USE);
    const useLabel = getUseLabel(LAND_USE);

    // Add detailed feature (with polygon geometry)
    detailedFeatures.push({
      type: 'Feature',
      properties: {
        apn: APN ? String(APN) : '',
        year,
        estimated,
        use: useLabel,
        address: FullAddress || '',
        area: SQFEET || 0,
        startTime,
        color,
      },
      geometry: feature.geometry,
    });

    // Add to cluster
    const [lng, lat] = getCentroid(feature.geometry);
    const clusterKey = getClusterKey(APN, lng, lat);
    const blockId = getBlockId(APN);

    let cluster = clusters.get(clusterKey);
    if (!cluster) {
      cluster = {
        blockId,
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
    cluster.useTypes[useLabel] = (cluster.useTypes[useLabel] || 0) + 1;
    cluster.totalArea += SQFEET || 0;
    if (year < cluster.earliestYear) cluster.earliestYear = year;
    if (estimated) cluster.hasEstimates = true;
  }

  console.log(`\nProcessed ${detailedFeatures.length} parcels into ${clusters.size} clusters`);
  console.log(`Year range: ${minYear} - ${maxYear}`);

  // Create aggregated features from clusters
  const aggregatedFeatures: GeoJSONFeature[] = [];

  for (const cluster of clusters.values()) {
    // Find dominant use
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
        blockId: cluster.blockId,
        year: cluster.earliestYear,
        use: dominantUse,
        count: cluster.count,
        area: Math.round(cluster.totalArea),
        estimated: cluster.hasEstimates,
        startTime,
        color: getLabelColor(dominantUse),
      },
      geometry: {
        type: 'Point',
        coordinates: [centroidLng, centroidLat],
      },
    });
  }

  // Sort by year
  detailedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));
  aggregatedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));

  // Write output
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Aggregated GeoJSON (points for zoomed-out view)
  const aggregatedPath = `${OUTPUT_DIR}/parcels.geojson`;
  await writeFile(aggregatedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: aggregatedFeatures,
  }));
  console.log(`\nWrote ${aggregatedPath} (${aggregatedFeatures.length} clusters)`);

  // Detailed GeoJSON (polygons for zoomed-in view)
  const detailedPath = `${OUTPUT_DIR}/parcels-detailed.geojson`;
  await writeFile(detailedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: detailedFeatures,
  }));
  console.log(`Wrote ${detailedPath} (${detailedFeatures.length} parcels)`);

  console.log(`\nDone! Year range for timeline: ${minYear}-${maxYear}`);
}

main().catch(console.error);
