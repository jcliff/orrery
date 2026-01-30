/**
 * SF Urban building data pipeline.
 *
 * Processes raw parcel data from SF OpenData into GeoJSON for visualization.
 * Uses historical development zones and 1906 fire boundary for synthetic
 * date generation when construction year is unknown.
 *
 * Data flow:
 *   raw/sf-urban/sf_parcels_*.json (from sf-urban-fetch.ts)
 *   raw/sf-urban/fire-boundary-1906-polygon.json (from sf-urban-fetch-fire-boundary.ts)
 *     → deduplicate by coordinates
 *     → generate/validate construction years
 *     → cluster by block + grid cell
 *     → processed/sf-urban/buildings.geojson (aggregated)
 *     → processed/sf-urban/buildings-detailed.geojson (individual)
 */

import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { createSyntheticDateGenerator } from '../data/sf-synthetic-dates.js';

const INPUT_DIR = new URL('../../data/raw/sf-urban', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/sf-urban', import.meta.url).pathname;
const FIRE_BOUNDARY_PATH = `${INPUT_DIR}/fire-boundary-1906-polygon.json`;

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
function getClusterKey(
  parcelNumber: string,
  lng: number,
  lat: number
): string {
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
  property_area?: string;
  number_of_stories?: string;
  number_of_units?: string;
}

interface BlockCluster {
  blockId: string;
  lngSum: number;
  latSum: number;
  useTypes: Record<string, { count: number; earliestYear: number }>;
  totalCount: number;
  totalArea: number;
  maxStories: number;
  earliestYear: number;
  hasEstimates: boolean;
  hasFireZone: boolean;
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
  'Single Family Residential': '#3498db', // Blue
  'Multi-Family Residential': '#9b59b6', // Purple
  'Commercial Retail': '#e74c3c', // Red
  'Commercial Office': '#e67e22', // Orange
  'Commercial Hotel': '#f39c12', // Gold
  'Commercial Misc': '#d35400', // Dark orange
  Industrial: '#7f8c8d', // Gray
  Government: '#27ae60', // Green
  'Miscellaneous/Mixed-Use': '#1abc9c', // Teal
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
  inFireZone: boolean;
  method: string;
  zone: string;
  use: string;
  address: string;
  neighborhood: string;
  parcelNumber: string;
  unitCount: number;
  area: number;
  stories: number;
}

async function checkFireBoundaryExists(): Promise<boolean> {
  try {
    await access(FIRE_BOUNDARY_PATH);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Processing SF parcel data...\n');

  // Check for fire boundary data
  const hasFireBoundary = await checkFireBoundaryExists();
  if (!hasFireBoundary) {
    console.error('ERROR: Fire boundary data not found.');
    console.error(`Expected: ${FIRE_BOUNDARY_PATH}`);
    console.error(
      '\nRun the fire boundary fetch first:\n  pnpm --filter fieldline pipeline:sf-urban-fire\n'
    );
    process.exit(1);
  }

  // Initialize synthetic date generator with fire boundary
  const dateGenerator = await createSyntheticDateGenerator(FIRE_BOUNDARY_PATH);
  const stats = dateGenerator.getStats();
  console.log(
    `Development zones: ${stats.zoneCount}, neighborhoods mapped: ${stats.neighborhoodsMapped}\n`
  );

  // Read all batch files
  const files = await readdir(INPUT_DIR);
  const jsonFiles = files.filter(
    (f) => f.startsWith('sf_parcels_') && f.endsWith('.json')
  );

  if (jsonFiles.length === 0) {
    console.error('ERROR: No parcel data found.');
    console.error(`Expected: ${INPUT_DIR}/sf_parcels_*.json`);
    console.error(
      '\nRun the parcel fetch first:\n  pnpm --filter fieldline pipeline:sf-urban-fetch\n'
    );
    process.exit(1);
  }

  console.log(`Found ${jsonFiles.length} batch files`);

  // Load all parcels
  const allParcels: RawParcel[] = [];
  for (const file of jsonFiles) {
    const path = `${INPUT_DIR}/${file}`;
    const content = await readFile(path, 'utf-8');
    const parcels: RawParcel[] = JSON.parse(content);
    allParcels.push(...parcels);
  }

  console.log(`Loaded ${allParcels.length.toLocaleString()} parcels\n`);

  // Deduplicate parcels by coordinates and generate dates
  const buildingsByCoord: Map<string, Building> = new Map();
  let totalParcels = 0;
  let knownYears = 0;
  let estimatedYears = 0;
  let inFireZoneCount = 0;
  let fireRebuildCount = 0;

  // Track estimation methods
  const methodCounts: Record<string, number> = {};

  for (const parcel of allParcels) {
    if (!parcel.the_geom) continue;
    totalParcels++;

    const [lng, lat] = parcel.the_geom.coordinates;
    const use = parcel.use_definition;
    const hood = parcel.analysis_neighborhood || 'Unknown';

    // Parse known year if available
    const rawYear = parseInt(parcel.year_property_built, 10);
    const hasKnownYear = !isNaN(rawYear) && rawYear >= 1800 && rawYear <= 2025;

    // Generate or validate date using historical model
    const dateResult = dateGenerator.generateDate({
      lng,
      lat,
      neighborhood: hood,
      knownYear: hasKnownYear ? rawYear : undefined,
    });

    // Track statistics
    if (dateResult.estimated) {
      estimatedYears++;
    } else {
      knownYears++;
    }

    if (dateResult.inFireZone) {
      inFireZoneCount++;
    }

    if (dateResult.method.includes('fire_rebuild')) {
      fireRebuildCount++;
    }

    methodCounts[dateResult.method] = (methodCounts[dateResult.method] || 0) + 1;

    // Clean up address format
    const address =
      parcel.property_location
        ?.replace(/^0+/, '')
        .replace(/\s+/g, ' ')
        .trim() || '';

    // Parse area and stories
    const area = parseFloat(parcel.property_area || '0') || 0;
    const stories = parseFloat(parcel.number_of_stories || '0') || 0;

    // Dedupe by coordinates
    const coordKey = getCoordKey(lng, lat);
    const existing = buildingsByCoord.get(coordKey);

    if (!existing) {
      buildingsByCoord.set(coordKey, {
        lng,
        lat,
        year: dateResult.year,
        estimated: dateResult.estimated,
        inFireZone: dateResult.inFireZone,
        method: dateResult.method,
        zone: dateResult.zone,
        use,
        address,
        neighborhood: hood,
        parcelNumber: parcel.parcel_number,
        unitCount: 1,
        area,
        stories,
      });
    } else {
      // Merge: keep earliest year, sum areas, max stories
      existing.unitCount++;
      existing.area += area;
      existing.stories = Math.max(existing.stories, stories);
      if (dateResult.year < existing.year) {
        existing.year = dateResult.year;
        existing.estimated = dateResult.estimated;
        existing.inFireZone = dateResult.inFireZone;
        existing.method = dateResult.method;
        existing.zone = dateResult.zone;
        existing.use = use;
        existing.address = address;
      }
    }
  }

  console.log(
    `Deduplicated ${totalParcels.toLocaleString()} parcels to ${buildingsByCoord.size.toLocaleString()} buildings\n`
  );

  // Print statistics
  console.log('Date generation statistics:');
  console.log(`  Known years: ${knownYears.toLocaleString()}`);
  console.log(`  Estimated years: ${estimatedYears.toLocaleString()}`);
  console.log(`  In 1906 fire zone: ${inFireZoneCount.toLocaleString()}`);
  console.log(`  Fire rebuilds (estimated): ${fireRebuildCount.toLocaleString()}`);
  console.log('\nEstimation methods:');
  const sortedMethods = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);
  for (const [method, count] of sortedMethods.slice(0, 15)) {
    console.log(`  ${method}: ${count.toLocaleString()}`);
  }
  if (sortedMethods.length > 15) {
    console.log(`  ... and ${sortedMethods.length - 15} more`);
  }

  // Create features and clusters from deduplicated buildings
  const clusters: Map<string, BlockCluster> = new Map();
  const detailedFeatures: GeoJSONFeature[] = [];

  for (const building of buildingsByCoord.values()) {
    const {
      lng,
      lat,
      year,
      estimated,
      inFireZone,
      method,
      zone,
      use,
      address,
      neighborhood,
      parcelNumber,
      unitCount,
      area,
      stories,
    } = building;

    const startTime = `${year}-01-01T00:00:00Z`;

    // Add to detailed features
    detailedFeatures.push({
      type: 'Feature',
      properties: {
        year,
        estimated,
        inFireZone,
        method,
        zone,
        use,
        address,
        neighborhood,
        startTime,
        color: getUseColor(use),
        units: unitCount,
        area: Math.round(area),
        stories: Math.round(stories),
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
        totalArea: 0,
        maxStories: 0,
        earliestYear: year,
        hasEstimates: false,
        hasFireZone: false,
      };
      clusters.set(clusterKey, cluster);
    }

    // Accumulate coordinates for centroid calculation
    cluster.lngSum += lng;
    cluster.latSum += lat;
    cluster.totalArea += area;
    cluster.maxStories = Math.max(cluster.maxStories, stories);

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
    if (inFireZone) {
      cluster.hasFireZone = true;
    }
  }

  console.log(`\nCreated ${clusters.size} clusters (block-bounded grid cells)`);

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
        area: Math.round(cluster.totalArea),
        stories: Math.round(cluster.maxStories),
        estimated: cluster.hasEstimates,
        inFireZone: cluster.hasFireZone,
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
  detailedFeatures.sort(
    (a, b) => (a.properties.year as number) - (b.properties.year as number)
  );
  aggregatedFeatures.sort(
    (a, b) => (a.properties.year as number) - (b.properties.year as number)
  );

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Write aggregated GeoJSON
  const aggregatedPath = `${OUTPUT_DIR}/buildings.geojson`;
  await writeFile(
    aggregatedPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: aggregatedFeatures,
    })
  );
  console.log(`\nWrote ${aggregatedPath} (${aggregatedFeatures.length} clusters)`);

  // Write detailed GeoJSON
  const detailedPath = `${OUTPUT_DIR}/buildings-detailed.geojson`;
  await writeFile(
    detailedPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: detailedFeatures,
    })
  );
  console.log(
    `Wrote ${detailedPath} (${detailedFeatures.length} buildings)`
  );

  // Copy fire boundary to output
  const fireBoundaryContent = await readFile(FIRE_BOUNDARY_PATH, 'utf-8');
  const fireBoundaryOutputPath = `${OUTPUT_DIR}/fire-boundary-1906.geojson`;
  await writeFile(fireBoundaryOutputPath, fireBoundaryContent);
  console.log(`Wrote ${fireBoundaryOutputPath}`);
}

main().catch(console.error);
