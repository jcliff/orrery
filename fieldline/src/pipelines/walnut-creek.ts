import { readFile, writeFile, mkdir } from 'node:fs/promises';

const INPUT_PATH = new URL('../../data/raw/walnut-creek/parcels.geojson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/walnut-creek', import.meta.url).pathname;

// Grid cell size for aggregation (~50m at Walnut Creek latitude)
const GRID_SIZE = 0.0005;

// Extract block ID from APN (first 5 digits for Contra Costa County format)
function getBlockId(apn: string): string {
  const cleaned = apn.replace(/[-\s]/g, '');
  if (cleaned.length >= 5) {
    return cleaned.substring(0, 5);
  }
  return cleaned || 'unknown';
}

// Get grid cell key from coordinates
function getGridKey(lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

// Composite key: block + grid cell
function getClusterKey(apn: string, lng: number, lat: number): string {
  return `${getBlockId(apn)}:${getGridKey(lng, lat)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    apn_pt_APN: string;
    apn_pt_YR_HS_BLT: string | null;
    apn_pt_YR_BUILT: string | null;
    apn_pt_USE_DESC: string | null;
    full_addre: string | null;
    apn_pt_TOT_AREA: number | null;
    apn_pt_BLDG_SQFT: number | null;
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

// Walnut Creek use type colors
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

function getUseCategory(useDesc: string | null): string {
  if (!useDesc) return 'Unknown';
  const lower = useDesc.toLowerCase();

  if (lower.includes('single') || lower.includes('sfr') || lower.includes('1 fam') || lower.includes('residence')) {
    return 'Single Family';
  }
  if (lower.includes('multi') || lower.includes('apartment') || lower.includes('condo') || lower.includes('duplex') || lower.includes('triplex') || lower.includes('fourplex') || lower.includes('2-4')) {
    return 'Multi-Family';
  }
  if (lower.includes('commercial') || lower.includes('retail') || lower.includes('office') || lower.includes('store') || lower.includes('shopping')) {
    return 'Commercial';
  }
  if (lower.includes('industrial') || lower.includes('warehouse') || lower.includes('manufacturing')) {
    return 'Industrial';
  }
  if (lower.includes('park') || lower.includes('open space') || lower.includes('vacant') || lower.includes('agricultural')) {
    return 'Open Space';
  }
  if (lower.includes('public') || lower.includes('school') || lower.includes('government') || lower.includes('church') || lower.includes('hospital')) {
    return 'Public';
  }
  if (lower.includes('mixed')) {
    return 'Mixed';
  }

  return 'Unknown';
}

function getUseColor(category: string): string {
  return USE_COLORS[category] || '#95a5a6';
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
  console.log('Processing Walnut Creek parcel data...');

  // Read raw data
  const content = await readFile(INPUT_PATH, 'utf-8');
  const raw = JSON.parse(content) as { type: string; features: RawFeature[] };

  console.log(`Loaded ${raw.features.length} parcels`);

  // First pass: collect stats
  let withYear = 0;
  let withoutYear = 0;
  const yearsByUse: Record<string, number[]> = {};

  for (const feature of raw.features) {
    // Try apn_pt_YR_HS_BLT first, then apn_pt_YR_BUILT
    const yearStr = feature.properties.apn_pt_YR_HS_BLT || feature.properties.apn_pt_YR_BUILT;
    const year = yearStr ? parseInt(yearStr, 10) : 0;
    const useCategory = getUseCategory(feature.properties.apn_pt_USE_DESC);

    if (year && year >= 1800 && year <= 2025) {
      withYear++;
      if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
      yearsByUse[useCategory].push(year);
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

  console.log(`\nMedian years by use type:`);
  for (const [use, med] of Object.entries(medianByUse).sort((a, b) => a[1] - b[1])) {
    console.log(`  ${use}: ${med}`);
  }
  console.log(`  Global median: ${globalMedian}`);

  // Second pass: create detailed features and clusters
  const detailedFeatures: GeoJSONFeature[] = [];
  const clusters: Map<string, Cluster> = new Map();
  let minYear = 9999;
  let maxYear = 0;

  for (const feature of raw.features) {
    const { apn_pt_APN, apn_pt_YR_HS_BLT, apn_pt_YR_BUILT, apn_pt_USE_DESC, full_addre, apn_pt_BLDG_SQFT } = feature.properties;

    // Skip parcels without geometry
    if (!feature.geometry) continue;

    // Determine year (prefer apn_pt_YR_HS_BLT over apn_pt_YR_BUILT)
    const yearStr = apn_pt_YR_HS_BLT || apn_pt_YR_BUILT;
    const yearNum = yearStr ? parseInt(yearStr, 10) : 0;
    const hasKnownYear = yearNum >= 1800 && yearNum <= 2025;
    const useCategory = getUseCategory(apn_pt_USE_DESC);
    const year = hasKnownYear
      ? yearNum
      : (medianByUse[useCategory] || globalMedian);
    const estimated = !hasKnownYear;

    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;

    const startTime = `${year}-01-01T00:00:00Z`;
    const color = getUseColor(useCategory);

    // Add detailed feature (with polygon geometry)
    detailedFeatures.push({
      type: 'Feature',
      properties: {
        apn: apn_pt_APN?.trim() || '',
        year,
        estimated,
        use: useCategory,
        address: full_addre || '',
        area: apn_pt_BLDG_SQFT || 0,
        startTime,
        color,
      },
      geometry: feature.geometry,
    });

    // Add to cluster
    const [lng, lat] = getCentroid(feature.geometry);
    const clusterKey = getClusterKey(apn_pt_APN || '', lng, lat);
    const blockId = getBlockId(apn_pt_APN || '');

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
    cluster.useTypes[useCategory] = (cluster.useTypes[useCategory] || 0) + 1;
    cluster.totalArea += apn_pt_BLDG_SQFT || 0;
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
        color: getUseColor(dominantUse),
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
