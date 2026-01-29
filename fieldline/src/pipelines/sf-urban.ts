import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';

const INPUT_DIR = new URL('../../data/raw/sf-urban', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../data/processed/sf-urban', import.meta.url).pathname;

// Round coordinates to 5 decimal places (~1m precision)
function roundCoord(coord: number): number {
  return Math.round(coord * 100000) / 100000;
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

// Color by era
function getEraColor(year: number): string {
  if (year < 1860) return '#8b0000';      // Pre-1860: Dark red (Gold Rush era)
  if (year < 1880) return '#e74c3c';      // 1860-1880: Red (early growth)
  if (year < 1906) return '#e67e22';      // 1880-1906: Orange (Victorian era)
  if (year < 1920) return '#f39c12';      // 1906-1920: Gold (post-earthquake rebuild)
  if (year < 1945) return '#27ae60';      // 1920-1945: Green (pre-war)
  if (year < 1970) return '#3498db';      // 1945-1970: Blue (post-war boom)
  if (year < 2000) return '#9b59b6';      // 1970-2000: Purple (modern)
  return '#1abc9c';                        // 2000+: Teal (contemporary)
}

async function main() {
  console.log('Processing SF parcel data...');

  // Read all batch files
  const files = await readdir(INPUT_DIR);
  const jsonFiles = files.filter(f => f.startsWith('sf_parcels_') && f.endsWith('.json'));

  console.log(`Found ${jsonFiles.length} batch files`);

  const features: GeoJSONFeature[] = [];
  const byDecade: Record<number, number> = {};
  const byNeighborhood: Record<string, number> = {};
  let minYear = Infinity;
  let maxYear = -Infinity;
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

      // Track stats
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
      const decade = Math.floor(year / 10) * 10;
      byDecade[decade] = (byDecade[decade] || 0) + 1;
      byNeighborhood[parcel.analysis_neighborhood] = (byNeighborhood[parcel.analysis_neighborhood] || 0) + 1;

      // Use January 1st of the year as the build date
      const startTime = `${year}-01-01T00:00:00Z`;

      features.push({
        type: 'Feature',
        properties: {
          id: parcel.parcel_number,
          year,
          use: parcel.use_definition,
          neighborhood: parcel.analysis_neighborhood,
          startTime,
          color: getEraColor(year),
        },
        geometry: {
          type: 'Point',
          coordinates: [
            roundCoord(parcel.the_geom.coordinates[0]),
            roundCoord(parcel.the_geom.coordinates[1]),
          ],
        },
      });
    }
  }

  console.log(`\nProcessed ${features.length} buildings (skipped ${skipped} invalid)`);
  console.log(`Year range: ${minYear} - ${maxYear}`);

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Write GeoJSON
  const outputPath = `${OUTPUT_DIR}/buildings.geojson`;
  const geojson: GeoJSONFeatureCollection = {
    type: 'FeatureCollection',
    features,
  };
  await writeFile(outputPath, JSON.stringify(geojson));
  console.log(`Wrote ${outputPath}`);

  // Stats
  console.log('\nBuildings by decade:');
  for (const [decade, count] of Object.entries(byDecade).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${decade}s: ${count.toLocaleString()}`);
  }

  console.log('\nTop 10 neighborhoods:');
  const sortedNeighborhoods = Object.entries(byNeighborhood).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [hood, count] of sortedNeighborhoods) {
    console.log(`  ${hood}: ${count.toLocaleString()}`);
  }
}

main().catch(console.error);
