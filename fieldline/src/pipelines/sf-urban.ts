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
}

interface GridCell {
  lng: number;
  lat: number;
  useTypes: Record<string, { count: number; earliestYear: number }>;
  totalCount: number;
  earliestYear: number;
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[];
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
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

async function main() {
  console.log('Processing SF parcel data with grid aggregation...');

  // Read all batch files
  const files = await readdir(INPUT_DIR);
  const jsonFiles = files.filter(f => f.startsWith('sf_parcels_') && f.endsWith('.json'));

  console.log(`Found ${jsonFiles.length} batch files`);

  // Aggregate into grid cells
  const grid: Map<string, GridCell> = new Map();
  let totalParcels = 0;
  let skipped = 0;

  for (const file of jsonFiles) {
    const path = `${INPUT_DIR}/${file}`;
    const content = await readFile(path, 'utf-8');
    const parcels: RawParcel[] = JSON.parse(content);

    console.log(`Processing ${file}: ${parcels.length} parcels`);

    for (const parcel of parcels) {
      const year = parseInt(parcel.year_property_built, 10);

      // Skip invalid years
      if (isNaN(year) || year < 1800 || year > 2025) {
        skipped++;
        continue;
      }

      totalParcels++;
      const [lng, lat] = parcel.the_geom.coordinates;
      const key = getGridKey(lng, lat);
      const use = parcel.use_definition;

      let cell = grid.get(key);
      if (!cell) {
        cell = {
          lng: parseGridKey(key)[0],
          lat: parseGridKey(key)[1],
          useTypes: {},
          totalCount: 0,
          earliestYear: year,
        };
        grid.set(key, cell);
      }

      // Track use type counts and earliest year per use
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
    }
  }

  console.log(`\nAggregated ${totalParcels} buildings into ${grid.size} grid cells (skipped ${skipped} invalid)`);

  // Convert grid cells to features
  const features: GeoJSONFeature[] = [];

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

    features.push({
      type: 'Feature',
      properties: {
        year: cell.earliestYear,
        use: dominantUse,
        count: cell.totalCount,
        startTime,
        color: getUseColor(dominantUse),
      },
      geometry: {
        type: 'Point',
        coordinates: [
          Math.round(cell.lng * 100000) / 100000,
          Math.round(cell.lat * 100000) / 100000,
        ],
      },
    });
  }

  // Sort by year for better rendering order
  features.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));

  console.log(`Created ${features.length} grid cell features`);

  // Stats by use type
  const byUse: Record<string, number> = {};
  for (const f of features) {
    const use = f.properties.use as string;
    byUse[use] = (byUse[use] || 0) + 1;
  }

  console.log('\nGrid cells by dominant use:');
  for (const [use, count] of Object.entries(byUse).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${use}: ${count.toLocaleString()}`);
  }

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Write GeoJSON
  const outputPath = `${OUTPUT_DIR}/buildings.geojson`;
  const geojson: GeoJSONFeatureCollection = {
    type: 'FeatureCollection',
    features,
  };
  await writeFile(outputPath, JSON.stringify(geojson));
  console.log(`\nWrote ${outputPath}`);
}

main().catch(console.error);
