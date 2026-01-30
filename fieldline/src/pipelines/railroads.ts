import { writeFile, mkdir } from 'node:fs/promises';
import shapefile from 'shapefile';
import proj4 from 'proj4';

const INPUT_PATH = new URL('../../data/raw/railroads/RR1826-1911Modified103123.shp', import.meta.url).pathname;

// Define the Albers Equal Area Conic projection used by the shapefile
const ALBERS = '+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

// Transform a coordinate from Albers to WGS84 (5 decimal places = ~1m precision)
function transformCoord(coord: number[]): number[] {
  const [x, y] = coord;
  const [lng, lat] = proj4(ALBERS, WGS84, [x, y]);
  return [Math.round(lng * 100000) / 100000, Math.round(lat * 100000) / 100000];
}

// Transform all coordinates in a geometry
function transformGeometry(geometry: { type: string; coordinates: unknown }): { type: string; coordinates: unknown } {
  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates as number[][];
    return {
      type: geometry.type,
      coordinates: coords.map(transformCoord),
    };
  } else if (geometry.type === 'MultiLineString') {
    const coords = geometry.coordinates as number[][][];
    return {
      type: geometry.type,
      coordinates: coords.map(line => line.map(transformCoord)),
    };
  }
  return geometry;
}
const OUTPUT_DIR = new URL('../../../chrona/public/data/railroads', import.meta.url).pathname;

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

// Regional groupings for coloring
const REGIONS: Record<string, string> = {
  // Northeast (Blue)
  'Maine': 'northeast', 'New Hampshire': 'northeast', 'Vermont': 'northeast',
  'Massachusetts': 'northeast', 'Rhode Island': 'northeast', 'Connecticut': 'northeast',
  'New York': 'northeast', 'New Jersey': 'northeast', 'Pennsylvania': 'northeast',

  // Southeast (Red/Orange)
  'Delaware': 'southeast', 'Maryland': 'southeast', 'District of Columbia': 'southeast',
  'Virginia': 'southeast', 'West Virginia': 'southeast', 'North Carolina': 'southeast',
  'South Carolina': 'southeast', 'Georgia': 'southeast', 'Florida': 'southeast',
  'Alabama': 'southeast', 'Mississippi': 'southeast', 'Tennessee': 'southeast',
  'Kentucky': 'southeast', 'Louisiana': 'southeast', 'Arkansas': 'southeast',

  // Midwest (Green)
  'Ohio': 'midwest', 'Indiana': 'midwest', 'Illinois': 'midwest',
  'Michigan': 'midwest', 'Wisconsin': 'midwest', 'Minnesota': 'midwest',
  'Iowa': 'midwest', 'Missouri': 'midwest',

  // Great Plains (Yellow/Gold)
  'North Dakota': 'plains', 'South Dakota': 'plains', 'Nebraska': 'plains',
  'Kansas': 'plains', 'Oklahoma Territory': 'plains', 'Indian Territory': 'plains',
  'Texas': 'plains',

  // Mountain West (Purple)
  'Montana': 'mountain', 'Wyoming': 'mountain', 'Colorado': 'mountain',
  'New Mexico Territory': 'mountain', 'Arizona Territory': 'mountain',
  'Utah': 'mountain', 'Nevada': 'mountain', 'Idaho': 'mountain',

  // Pacific (Teal)
  'Washington': 'pacific', 'Oregon': 'pacific', 'California': 'pacific',
};

const REGION_COLORS: Record<string, string> = {
  'northeast': '#3498db',  // Blue
  'southeast': '#e74c3c',  // Red
  'midwest': '#27ae60',    // Green
  'plains': '#f39c12',     // Gold
  'mountain': '#9b59b6',   // Purple
  'pacific': '#1abc9c',    // Teal
};

function getRegionColor(state: string): string {
  const region = REGIONS[state];
  return region ? REGION_COLORS[region] : '#95a5a6'; // Gray for unknown
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

    const region = REGIONS[props.STATENAM] || 'unknown';

    features.push({
      type: 'Feature',
      properties: {
        id: props.FIDAll,
        name: props.RRname,
        state: props.STATENAM,
        region,
        year: year,
        miles: props.Miles,
        gauge: props.Gauge,
        startTime,
        color: getRegionColor(props.STATENAM),
      },
      geometry: transformGeometry(result.value.geometry) as GeoJSONFeature['geometry'],
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
