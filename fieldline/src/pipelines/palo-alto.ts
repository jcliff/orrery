import { readFile, writeFile, mkdir } from 'node:fs/promises';

const INPUT_PATH = new URL('../../data/raw/palo-alto/parcels.geojson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../data/processed/palo-alto', import.meta.url).pathname;

// Grid cell size for aggregation (~50m at Palo Alto latitude)
const GRID_SIZE = 0.0005;

// Extract block ID from APN (first two segments: book-page)
// e.g., "120-26-103" -> "120-26"
function getBlockId(apn: string): string {
  const parts = apn.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return apn;
}

// Get grid cell key from coordinates
function getGridKey(lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

// Composite key: block + grid cell (respects block boundaries, maintains granularity)
function getClusterKey(apn: string, lng: number, lat: number): string {
  return `${getBlockId(apn)}:${getGridKey(lng, lat)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    APN: string;
    YEARBUILT: number | null;
    EFFECTIVEYEARBUILT: number | null;
    LANDUSEGIS: string | null;
    ADDRESSNUMBER: string | null;
    STREET: string | null;
    LOTSIZE: number | null;
    ZONEGIS: string | null;
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

// Palo Alto land use codes to colors
// Based on LANDUSEGIS field values
const USE_COLORS: Record<string, string> = {
  'SF': '#3498db',           // Single Family - Blue
  'MF': '#9b59b6',           // Multi-Family - Purple
  'CC': '#e74c3c',           // Community Commercial - Red
  'CN': '#e67e22',           // Neighborhood Commercial - Orange
  'CS': '#d35400',           // Service Commercial - Dark Orange
  'CD': '#f39c12',           // Downtown Commercial - Gold
  'RM': '#9b59b6',           // Multi-Family Residential - Purple
  'RMD': '#8e44ad',          // Multi-Family Residential (Dense) - Darker Purple
  'OS': '#27ae60',           // Open Space - Green
  'PF': '#2ecc71',           // Public Facilities - Light Green
  'ROLM': '#7f8c8d',         // Research/Office/Light Manufacturing - Gray
  'GM': '#95a5a6',           // General Manufacturing - Light Gray
  'MISP': '#1abc9c',         // Mixed Industrial/Service/Park - Teal
  'PC': '#16a085',           // Planned Community - Dark Teal
};

// Friendly labels for use types
const USE_LABELS: Record<string, string> = {
  'SF': 'Single Family',
  'MF': 'Multi-Family',
  'CC': 'Community Commercial',
  'CN': 'Neighborhood Commercial',
  'CS': 'Service Commercial',
  'CD': 'Downtown Commercial',
  'RM': 'Multi-Family Residential',
  'RMD': 'Multi-Family Residential (Dense)',
  'OS': 'Open Space',
  'PF': 'Public Facilities',
  'ROLM': 'Research/Office/Light Mfg',
  'GM': 'General Manufacturing',
  'MISP': 'Mixed Industrial/Service',
  'PC': 'Planned Community',
};

function getUseColor(use: string | null): string {
  if (!use) return '#95a5a6';
  // Handle compound use codes like "MISP;S;RO"
  const primary = use.split(';')[0].trim();
  return USE_COLORS[primary] || '#95a5a6';
}

function getUseLabel(use: string | null): string {
  if (!use) return 'Unknown';
  const primary = use.split(';')[0].trim();
  return USE_LABELS[primary] || use;
}

// Color lookup by label (for aggregated features)
const LABEL_COLORS: Record<string, string> = {
  'Single Family': '#3498db',
  'Multi-Family': '#9b59b6',
  'Multi-Family Residential': '#9b59b6',
  'Multi-Family Residential (Dense)': '#8e44ad',
  'Community Commercial': '#e74c3c',
  'Neighborhood Commercial': '#e67e22',
  'Service Commercial': '#d35400',
  'Downtown Commercial': '#f39c12',
  'Open Space': '#27ae60',
  'Public Facilities': '#2ecc71',
  'Research/Office/Light Mfg': '#7f8c8d',
  'General Manufacturing': '#95a5a6',
  'Mixed Industrial/Service': '#1abc9c',
  'Planned Community': '#16a085',
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
  console.log('Processing Palo Alto parcel data...');

  // Read raw data
  const content = await readFile(INPUT_PATH, 'utf-8');
  const raw = JSON.parse(content) as { type: string; features: RawFeature[] };

  console.log(`Loaded ${raw.features.length} parcels`);

  // First pass: collect stats
  let withYear = 0;
  let withoutYear = 0;
  const yearsByUse: Record<string, number[]> = {};

  for (const feature of raw.features) {
    const year = feature.properties.YEARBUILT;
    const use = feature.properties.LANDUSEGIS || 'Unknown';

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
  const globalMedian = sortedAll[Math.floor(sortedAll.length / 2)] || 1950;

  console.log(`\nMedian years by use type:`);
  for (const [use, med] of Object.entries(medianByUse).sort((a, b) => a[1] - b[1])) {
    console.log(`  ${getUseLabel(use)}: ${med}`);
  }
  console.log(`  Global median: ${globalMedian}`);

  // Second pass: create detailed features and clusters
  const detailedFeatures: GeoJSONFeature[] = [];
  const clusters: Map<string, Cluster> = new Map();
  let minYear = 9999;
  let maxYear = 0;

  for (const feature of raw.features) {
    const { APN, YEARBUILT, LANDUSEGIS, ADDRESSNUMBER, STREET, LOTSIZE } = feature.properties;

    // Skip parcels without geometry
    if (!feature.geometry) continue;

    // Determine year
    const hasKnownYear = YEARBUILT && YEARBUILT >= 1800 && YEARBUILT <= 2025;
    const use = LANDUSEGIS || 'Unknown';
    const year = hasKnownYear
      ? YEARBUILT
      : (medianByUse[use] || globalMedian);
    const estimated = !hasKnownYear;

    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;

    const startTime = `${year}-01-01T00:00:00Z`;
    const color = getUseColor(LANDUSEGIS);
    const useLabel = getUseLabel(LANDUSEGIS);

    // Build address
    const address = ADDRESSNUMBER && STREET
      ? `${ADDRESSNUMBER} ${STREET}`
      : (STREET || '');

    // Add detailed feature (with polygon geometry)
    detailedFeatures.push({
      type: 'Feature',
      properties: {
        apn: APN,
        year,
        estimated,
        use: useLabel,
        address,
        area: LOTSIZE || 0,
        startTime,
        color,
      },
      geometry: feature.geometry,
    });

    // Add to cluster (block + grid cell ensures no cross-street grouping)
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
    cluster.totalArea += LOTSIZE || 0;
    if (year < cluster.earliestYear) cluster.earliestYear = year;
    if (estimated) cluster.hasEstimates = true;
  }

  console.log(`\nProcessed ${detailedFeatures.length} parcels into ${clusters.size} clusters (block-bounded grid cells)`);
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
