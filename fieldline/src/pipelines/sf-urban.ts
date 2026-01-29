import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';

const INPUT_DIR = new URL('../../data/raw/sf-urban', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../data/processed/sf-urban', import.meta.url).pathname;

// Grid cell size in degrees (~50m at SF latitude)
const GRID_SIZE = 0.0005;

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

interface GridCell {
  lng: number;
  lat: number;
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

// Get grid cell key from coordinates
function getGridKey(lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

// Parse grid key back to coordinates
function parseGridKey(key: string): [number, number] {
  const [lng, lat] = key.split(',').map(Number);
  return [lng + GRID_SIZE / 2, lat + GRID_SIZE / 2]; // Center of cell
}

// Round coordinate to 5 decimal places
function roundCoord(n: number): number {
  return Math.round(n * 100000) / 100000;
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

  // Second pass: process all parcels
  const grid: Map<string, GridCell> = new Map();
  const detailedFeatures: GeoJSONFeature[] = [];
  let knownYears = 0;
  let estimatedYears = 0;

  for (const parcel of allParcels) {
    if (!parcel.the_geom) continue;

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

    const startTime = `${year}-01-01T00:00:00Z`;

    // Clean up address format
    const address = parcel.property_location
      ?.replace(/^0+/, '')
      .replace(/\s+/g, ' ')
      .trim() || '';

    // Add to detailed features
    detailedFeatures.push({
      type: 'Feature',
      properties: {
        year,
        estimated,
        use,
        address,
        neighborhood: hood,
        startTime,
        color: getUseColor(use),
      },
      geometry: {
        type: 'Point',
        coordinates: [roundCoord(lng), roundCoord(lat)],
      },
    });

    // Add to grid aggregation
    const key = getGridKey(lng, lat);
    let cell = grid.get(key);
    if (!cell) {
      cell = {
        lng: parseGridKey(key)[0],
        lat: parseGridKey(key)[1],
        useTypes: {},
        totalCount: 0,
        earliestYear: year,
        hasEstimates: false,
      };
      grid.set(key, cell);
    }

    if (!cell.useTypes[use]) {
      cell.useTypes[use] = { count: 0, earliestYear: year };
    }
    cell.useTypes[use].count++;
    if (year < cell.useTypes[use].earliestYear) {
      cell.useTypes[use].earliestYear = year;
    }

    cell.totalCount++;
    if (year < cell.earliestYear) {
      cell.earliestYear = year;
    }
    if (estimated) {
      cell.hasEstimates = true;
    }
  }

  console.log(`\nProcessed ${detailedFeatures.length} buildings into ${grid.size} grid cells`);
  console.log(`  Known years: ${knownYears.toLocaleString()}`);
  console.log(`  Estimated years: ${estimatedYears.toLocaleString()}`);

  // Convert grid cells to aggregated features
  const aggregatedFeatures: GeoJSONFeature[] = [];

  for (const cell of grid.values()) {
    // Find dominant use type
    let dominantUse = '';
    let maxCount = 0;
    for (const [use, data] of Object.entries(cell.useTypes)) {
      if (data.count > maxCount) {
        maxCount = data.count;
        dominantUse = use;
      }
    }

    const startTime = `${cell.earliestYear}-01-01T00:00:00Z`;

    aggregatedFeatures.push({
      type: 'Feature',
      properties: {
        year: cell.earliestYear,
        use: dominantUse,
        count: cell.totalCount,
        estimated: cell.hasEstimates,
        startTime,
        color: getUseColor(dominantUse),
      },
      geometry: {
        type: 'Point',
        coordinates: [roundCoord(cell.lng), roundCoord(cell.lat)],
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
  console.log(`\nWrote ${aggregatedPath} (${aggregatedFeatures.length} grid cells)`);

  // Write detailed GeoJSON
  const detailedPath = `${OUTPUT_DIR}/buildings-detailed.geojson`;
  await writeFile(detailedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: detailedFeatures,
  }));
  console.log(`Wrote ${detailedPath} (${detailedFeatures.length} buildings)`);
}

main().catch(console.error);
