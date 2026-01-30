import { readFile, writeFile, mkdir } from 'node:fs/promises';

const INPUT_PATH = new URL('../../data/raw/solano/parcels.geojson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/solano', import.meta.url).pathname;

// Grid cell size for aggregation (~50m at Solano latitude)
const GRID_SIZE = 0.0005;

// Extract block ID from parcel ID (first 3 digits typically represent tract/area)
function getBlockId(parcelId: string): string {
  const cleaned = String(parcelId).replace(/\s/g, '');
  if (cleaned.length >= 3) {
    return cleaned.substring(0, 3);
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
function getClusterKey(parcelId: string, lng: number, lat: number): string {
  return `${getBlockId(parcelId)}:${getGridKey(lng, lat)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    parcelid: string | number;
    yrbuilt: number;
    sitecity: string | null;
    sitenum: number | null;
    siteroad: string | null;
    usecode: string | null;
    use_desc: string | null;
    lotsize: number | null;
    total_area: number | null;
    stories: number | null;
    bedroom: number | null;
    bathroom: number | null;
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

// Solano use code colors based on use_desc patterns
const USE_COLORS: Record<string, string> = {
  'Single Family': '#3498db',
  'Multi-Family': '#9b59b6',
  'Commercial': '#e74c3c',
  'Industrial': '#7f8c8d',
  'Agricultural': '#27ae60',
  'Public': '#2ecc71',
  'Vacant': '#bdc3c7',
  'Unknown': '#95a5a6',
};

function getUseCategory(useDesc: string | null): string {
  if (!useDesc) return 'Unknown';
  const lower = useDesc.toLowerCase();

  if (lower.includes('single') || lower.includes('sfr') || lower.includes('residence') || lower.includes('dwelling')) {
    return 'Single Family';
  }
  if (lower.includes('multi') || lower.includes('apartment') || lower.includes('condo') || lower.includes('duplex') || lower.includes('triplex')) {
    return 'Multi-Family';
  }
  if (lower.includes('commercial') || lower.includes('retail') || lower.includes('office') || lower.includes('store') || lower.includes('shopping')) {
    return 'Commercial';
  }
  if (lower.includes('industrial') || lower.includes('warehouse') || lower.includes('manufacturing') || lower.includes('factory')) {
    return 'Industrial';
  }
  if (lower.includes('agricultural') || lower.includes('farm') || lower.includes('ranch') || lower.includes('crop') || lower.includes('vineyard')) {
    return 'Agricultural';
  }
  if (lower.includes('public') || lower.includes('school') || lower.includes('government') || lower.includes('church') || lower.includes('hospital')) {
    return 'Public';
  }
  if (lower.includes('vacant') || lower.includes('land')) {
    return 'Vacant';
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
  city: string;
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  totalArea: number;
}

async function main() {
  console.log('Processing Solano County parcel data...');

  // Read raw data
  const content = await readFile(INPUT_PATH, 'utf-8');
  const raw = JSON.parse(content) as { type: string; features: RawFeature[] };

  console.log(`Loaded ${raw.features.length} parcels`);

  // First pass: collect stats
  let withYear = 0;
  let withoutYear = 0;
  const yearsByUse: Record<string, number[]> = {};
  const cityCounts: Record<string, number> = {};

  for (const feature of raw.features) {
    const year = feature.properties.yrbuilt;
    const useCategory = getUseCategory(feature.properties.use_desc);
    const city = feature.properties.sitecity || 'Unknown';

    cityCounts[city] = (cityCounts[city] || 0) + 1;

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

  console.log(`\nParcels by city:`);
  const sortedCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]);
  for (const [city, count] of sortedCities.slice(0, 10)) {
    console.log(`  ${city}: ${count.toLocaleString()}`);
  }

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
    const { parcelid, yrbuilt, sitecity, sitenum, siteroad, use_desc, lotsize } = feature.properties;

    // Skip parcels without geometry
    if (!feature.geometry) continue;

    // Determine year
    const hasKnownYear = yrbuilt >= 1800 && yrbuilt <= 2025;
    const useCategory = getUseCategory(use_desc);
    const year = hasKnownYear
      ? yrbuilt
      : (medianByUse[useCategory] || globalMedian);
    const estimated = !hasKnownYear;

    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;

    const startTime = `${year}-01-01T00:00:00Z`;
    const color = getUseColor(useCategory);

    // Build address
    const address = sitenum && siteroad
      ? `${sitenum} ${siteroad}${sitecity ? `, ${sitecity}` : ''}`
      : (sitecity || '');

    // Add detailed feature (with polygon geometry)
    detailedFeatures.push({
      type: 'Feature',
      properties: {
        parcelId: String(parcelid),
        year,
        estimated,
        use: useCategory,
        address,
        city: sitecity || '',
        area: lotsize || 0,
        startTime,
        color,
      },
      geometry: feature.geometry,
    });

    // Add to cluster
    const [lng, lat] = getCentroid(feature.geometry);
    const clusterKey = getClusterKey(String(parcelid), lng, lat);
    const blockId = getBlockId(String(parcelid));

    let cluster = clusters.get(clusterKey);
    if (!cluster) {
      cluster = {
        blockId,
        city: sitecity || '',
        lngSum: 0,
        latSum: 0,
        count: 0,
        useTypes: {},
        earliestYear: year,
        totalArea: 0,
      };
      clusters.set(clusterKey, cluster);
    }

    cluster.lngSum += lng;
    cluster.latSum += lat;
    cluster.count++;
    cluster.useTypes[useCategory] = (cluster.useTypes[useCategory] || 0) + 1;
    cluster.totalArea += lotsize || 0;
    if (year < cluster.earliestYear) cluster.earliestYear = year;
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
        city: cluster.city,
        year: cluster.earliestYear,
        use: dominantUse,
        count: cluster.count,
        area: Math.round(cluster.totalArea),
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
