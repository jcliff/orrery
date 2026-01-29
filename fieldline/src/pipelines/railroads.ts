import { writeFile, mkdir } from 'node:fs/promises';
import shapefile from 'shapefile';

const INPUT_PATH = new URL('../../data/raw/railroads/RR1826-1911Modified103123.shp', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../data/processed/railroads', import.meta.url).pathname;

interface RailroadProperties {
  FID_RR1826: number;
  track: number;
  VxCount: number;
  Gauge: number;
  RRname: string;
  InOpBy: number;
  ExactDate: number;
  FIDAll: number;
  Edited: number;
  Miles: number;
  FID_1900St: number;
  STATENAM: string;
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[][] | number[][][];
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Color palette for different eras
function getEraColor(year: number): string {
  if (year < 1850) return '#e74c3c';      // Pre-1850: Red (early pioneers)
  if (year < 1860) return '#e67e22';      // 1850s: Orange (pre-Civil War expansion)
  if (year < 1870) return '#f39c12';      // 1860s: Gold (Civil War era, transcontinental)
  if (year < 1880) return '#27ae60';      // 1870s: Green (post-war boom)
  if (year < 1890) return '#3498db';      // 1880s: Blue (golden age)
  if (year < 1900) return '#9b59b6';      // 1890s: Purple (consolidation)
  return '#1abc9c';                        // 1900+: Teal (20th century)
}

async function main() {
  console.log('Reading railroad shapefile...');

  const source = await shapefile.open(INPUT_PATH);
  const features: GeoJSONFeature[] = [];

  let minYear = Infinity;
  let maxYear = -Infinity;
  const byDecade: Record<number, number> = {};
  const byState: Record<string, number> = {};

  while (true) {
    const result = await source.read();
    if (result.done) break;

    const props = result.value.properties as RailroadProperties;
    const year = props.InOpBy;

    // Track stats
    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;
    const decade = Math.floor(year / 10) * 10;
    byDecade[decade] = (byDecade[decade] || 0) + 1;
    byState[props.STATENAM] = (byState[props.STATENAM] || 0) + 1;

    // Create feature with temporal properties
    // Use July 4th of the year as the opening date (symbolic)
    const startTime = `${year}-07-04T00:00:00Z`;

    features.push({
      type: 'Feature',
      properties: {
        id: props.FIDAll,
        name: props.RRname,
        state: props.STATENAM,
        year: year,
        miles: props.Miles,
        gauge: props.Gauge,
        startTime,
        color: getEraColor(year),
      },
      geometry: result.value.geometry,
    });
  }

  console.log(`Processed ${features.length} railroad segments`);
  console.log(`Year range: ${minYear} - ${maxYear}`);

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Write segments GeoJSON
  const segmentsPath = `${OUTPUT_DIR}/segments.geojson`;
  const geojson: GeoJSONFeatureCollection = {
    type: 'FeatureCollection',
    features,
  };
  await writeFile(segmentsPath, JSON.stringify(geojson));
  console.log(`Wrote ${segmentsPath}`);

  // Stats
  console.log('\nSegments by decade:');
  for (const [decade, count] of Object.entries(byDecade).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${decade}s: ${count}`);
  }

  console.log('\nTop 10 states by segments:');
  const sortedStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [state, count] of sortedStates) {
    console.log(`  ${state}: ${count}`);
  }
}

main().catch(console.error);
