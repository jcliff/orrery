import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';

const INPUT_DIR = new URL('../../data/raw/sf-urban', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../data/processed/sf-urban', import.meta.url).pathname;

// Grid cell size in degrees (~50m at SF latitude)
const GRID_SIZE = 0.0005;

// Extract block number from parcel number (first 4 digits)
function getBlockId(parcelNumber: string): string {
  return parcelNumber.slice(0, 4);
}

// Get grid cell key from coordinates
function getGridKey(lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

// Composite key: block + grid cell (respects block boundaries, maintains granularity)
function getClusterKey(parcelNumber: string, lng: number, lat: number): string {
  return `${getBlockId(parcelNumber)}:${getGridKey(lng, lat)}`;
}

interface RawParcel {
  parcel_number: string;
  year_property_built: string;
  use_definition: string;
  the_geom: {
    type: 'Point';
    coordinates: [number, number];
  };
  analysis_neighborhood: string;
  property_location?: string;
}

interface BlockCluster {
  blockId: string;
  // Sum of coordinates for centroid calculation
  lngSum: number;
  latSum: number;
  useTypes: Record<string, { count: number; earliestYear: number }>;
  totalCount: number;
  earliestYear: number;
  hasEstimates: boolean;
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[];
  };
}

// Color by use/zoning type
const USE_COLORS: Record<string, string> = {
  'Single Family Residential': '#3498db',    // Blue
  'Multi-Family Residential': '#9b59b6',     // Purple
  'Commercial Retail': '#e74c3c',            // Red
  'Commercial Office': '#e67e22',            // Orange
  'Commercial Hotel': '#f39c12',             // Gold
  'Commercial Misc': '#d35400',              // Dark orange
  'Industrial': '#7f8c8d',                   // Gray
  'Government': '#27ae60',                   // Green
  'Miscellaneous/Mixed-Use': '#1abc9c',      // Teal
};

function getUseColor(use: string): string {
  return USE_COLORS[use] || '#95a5a6';
}


// Round coordinate to 5 decimal places
function roundCoord(n: number): number {
  return Math.round(n * 100000) / 100000;
}

// Coordinate key for deduplication (condo units share same coords)
function getCoordKey(lng: number, lat: number): string {
  return `${roundCoord(lng)},${roundCoord(lat)}`;
}

// Represents a deduplicated building (may contain multiple condo units)
interface Building {
  lng: number;
  lat: number;
  year: number;
  estimated: boolean;
  use: string;
  address: string;
  neighborhood: string;
  parcelNumber: string;
  unitCount: number; // How many parcels/units at this location
}

// Calculate median of an array
function median(arr: number[]): number {
  if (arr.length === 0) return 1900; // Default fallback
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function main() {
  console.log('Processing SF parcel data...');

  // Read all batch files
  const files = await readdir(INPUT_DIR);
  const jsonFiles = files.filter(f => f.startsWith('sf_parcels_') && f.endsWith('.json'));

  console.log(`Found ${jsonFiles.length} batch files`);

  // First pass: collect years by neighborhood for median calculation
  const yearsByNeighborhood: Record<string, number[]> = {};
  const allParcels: RawParcel[] = [];

  for (const file of jsonFiles) {
    const path = `${INPUT_DIR}/${file}`;
    const content = await readFile(path, 'utf-8');
    const parcels: RawParcel[] = JSON.parse(content);
    allParcels.push(...parcels);

    for (const parcel of parcels) {
      const year = parseInt(parcel.year_property_built, 10);
      if (!isNaN(year) && year >= 1800 && year <= 2025) {
        const hood = parcel.analysis_neighborhood || 'Unknown';
        if (!yearsByNeighborhood[hood]) yearsByNeighborhood[hood] = [];
        yearsByNeighborhood[hood].push(year);
      }
    }
  }

  // Calculate median year per neighborhood
  const medianByNeighborhood: Record<string, number> = {};
  for (const [hood, years] of Object.entries(yearsByNeighborhood)) {
    medianByNeighborhood[hood] = median(years);
  }

  console.log('\nNeighborhood median years (for estimates):');
  for (const [hood, med] of Object.entries(medianByNeighborhood).sort((a, b) => a[1] - b[1])) {
    console.log(`  ${hood}: ${med}`);
  }

  // Second pass: deduplicate parcels by coordinates
  // Condo buildings have one parcel per unit, all at the same coordinates
  const buildingsByCoord: Map<string, Building> = new Map();
  let totalParcels = 0;
  let knownYears = 0;
  let estimatedYears = 0;

  for (const parcel of allParcels) {
    if (!parcel.the_geom) continue;
    totalParcels++;

    const [lng, lat] = parcel.the_geom.coordinates;
    const use = parcel.use_definition;
    const hood = parcel.analysis_neighborhood || 'Unknown';

    // Determine year (known or estimated)
    const rawYear = parseInt(parcel.year_property_built, 10);
    const hasKnownYear = !isNaN(rawYear) && rawYear >= 1800 && rawYear <= 2025;
    const year = hasKnownYear ? rawYear : (medianByNeighborhood[hood] || 1900);
    const estimated = !hasKnownYear;

    if (hasKnownYear) {
      knownYears++;
    } else {
      estimatedYears++;
    }

    // Clean up address format
    const address = parcel.property_location
      ?.replace(/^0+/, '')
      .replace(/\s+/g, ' ')
      .trim() || '';

    // Dedupe by coordinates
    const coordKey = getCoordKey(lng, lat);
    const existing = buildingsByCoord.get(coordKey);

    if (!existing) {
      buildingsByCoord.set(coordKey, {
        lng,
        lat,
        year,
        estimated,
        use,
        address,
        neighborhood: hood,
        parcelNumber: parcel.parcel_number,
        unitCount: 1,
      });
    } else {
      // Merge: keep earliest year, update use if this one is earlier
      existing.unitCount++;
      if (year < existing.year) {
        existing.year = year;
        existing.estimated = estimated;
        existing.use = use;
        existing.address = address;
      }
    }
  }

  console.log(`\nDeduplicated ${totalParcels.toLocaleString()} parcels to ${buildingsByCoord.size.toLocaleString()} buildings`);

  // Third pass: create features and clusters from deduplicated buildings
  const clusters: Map<string, BlockCluster> = new Map();
  const detailedFeatures: GeoJSONFeature[] = [];

  for (const building of buildingsByCoord.values()) {
    const { lng, lat, year, estimated, use, address, neighborhood, parcelNumber, unitCount } = building;
    const startTime = `${year}-01-01T00:00:00Z`;

    // Add to detailed features
    detailedFeatures.push({
      type: 'Feature',
      properties: {
        year,
        estimated,
        use,
        address,
        neighborhood,
        startTime,
        color: getUseColor(use),
        units: unitCount, // Track how many units (for condos)
      },
      geometry: {
        type: 'Point',
        coordinates: [roundCoord(lng), roundCoord(lat)],
      },
    });

    // Add to cluster (block + grid cell ensures no cross-street grouping)
    const clusterKey = getClusterKey(parcelNumber, lng, lat);
    const blockId = getBlockId(parcelNumber);
    let cluster = clusters.get(clusterKey);
    if (!cluster) {
      cluster = {
        blockId,
        lngSum: 0,
        latSum: 0,
        useTypes: {},
        totalCount: 0,
        earliestYear: year,
        hasEstimates: false,
      };
      clusters.set(clusterKey, cluster);
    }

    // Accumulate coordinates for centroid calculation
    cluster.lngSum += lng;
    cluster.latSum += lat;

    if (!cluster.useTypes[use]) {
      cluster.useTypes[use] = { count: 0, earliestYear: year };
    }
    cluster.useTypes[use].count++;
    if (year < cluster.useTypes[use].earliestYear) {
      cluster.useTypes[use].earliestYear = year;
    }

    cluster.totalCount++;
    if (year < cluster.earliestYear) {
      cluster.earliestYear = year;
    }
    if (estimated) {
      cluster.hasEstimates = true;
    }
  }

  console.log(`Created ${clusters.size} clusters (block-bounded grid cells)`);
  console.log(`  Parcels with known years: ${knownYears.toLocaleString()}`);
  console.log(`  Parcels with estimated years: ${estimatedYears.toLocaleString()}`);

  // Convert clusters to aggregated features
  const aggregatedFeatures: GeoJSONFeature[] = [];

  for (const cluster of clusters.values()) {
    // Find dominant use type
    let dominantUse = '';
    let maxCount = 0;
    for (const [use, data] of Object.entries(cluster.useTypes)) {
      if (data.count > maxCount) {
        maxCount = data.count;
        dominantUse = use;
      }
    }

    const startTime = `${cluster.earliestYear}-01-01T00:00:00Z`;

    // Use centroid of actual buildings in the cluster
    const centroidLng = cluster.lngSum / cluster.totalCount;
    const centroidLat = cluster.latSum / cluster.totalCount;

    aggregatedFeatures.push({
      type: 'Feature',
      properties: {
        blockId: cluster.blockId,
        year: cluster.earliestYear,
        use: dominantUse,
        count: cluster.totalCount,
        estimated: cluster.hasEstimates,
        startTime,
        color: getUseColor(dominantUse),
      },
      geometry: {
        type: 'Point',
        coordinates: [roundCoord(centroidLng), roundCoord(centroidLat)],
      },
    });
  }

  // Sort by year
  detailedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));
  aggregatedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Write aggregated GeoJSON
  const aggregatedPath = `${OUTPUT_DIR}/buildings.geojson`;
  await writeFile(aggregatedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: aggregatedFeatures,
  }));
  console.log(`\nWrote ${aggregatedPath} (${aggregatedFeatures.length} clusters)`);

  // Write detailed GeoJSON
  const detailedPath = `${OUTPUT_DIR}/buildings-detailed.geojson`;
  await writeFile(detailedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: detailedFeatures,
  }));
  console.log(`Wrote ${detailedPath} (${detailedFeatures.length} buildings)`);
}

main().catch(console.error);
