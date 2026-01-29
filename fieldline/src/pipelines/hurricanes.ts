import { writeFile, mkdir } from 'node:fs/promises';
import { fetchHurdat2, parseHurdat2 } from '../sources/hurdat2.js';
import { Storm, windToCategory } from '../schemas/storm.js';

const OUTPUT_DIR = new URL('../../data/processed', import.meta.url).pathname;

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[] | number[][];
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Saffir-Simpson colors
const CATEGORY_COLORS: Record<number, string> = {
  0: '#6ec4e8',  // TD/TS - light blue (using TD color for all sub-hurricane)
  1: '#ffe066',  // Cat 1 - yellow
  2: '#ffb347',  // Cat 2 - orange
  3: '#ff6b6b',  // Cat 3 - red-orange
  4: '#d63031',  // Cat 4 - red
  5: '#6c3483',  // Cat 5 - purple
};

function stormToLineFeature(storm: Storm): GeoJSONFeature {
  const coordinates = storm.track.map(p => [p.lon, p.lat]);

  // Get start and end times from track points
  const startTime = storm.track[0]?.timestamp;
  const endTime = storm.track[storm.track.length - 1]?.timestamp;

  return {
    type: 'Feature',
    properties: {
      id: storm.id,
      name: storm.name,
      year: storm.year,
      maxWind: storm.maxWind,
      minPressure: storm.minPressure,
      category: storm.category,
      color: CATEGORY_COLORS[storm.category] || CATEGORY_COLORS[0],
      startTime,
      endTime,
    },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

interface PointFeature extends GeoJSONFeature {
  properties: {
    stormId: string;
    stormName: string | null;
    timestamp: string;
    wind: number;
    pressure: number | null;
    status: string;
    category: number;
    color: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

function stormToPointFeatures(storm: Storm): PointFeature[] {
  return storm.track.map(point => ({
    type: 'Feature',
    properties: {
      stormId: storm.id,
      stormName: storm.name,
      timestamp: point.timestamp,
      wind: point.wind,
      pressure: point.pressure,
      status: point.status,
      category: windToCategory(point.wind),
      color: CATEGORY_COLORS[windToCategory(point.wind)] || CATEGORY_COLORS[0],
    },
    geometry: {
      type: 'Point',
      coordinates: [point.lon, point.lat],
    },
  }));
}

function createPointsGeoJSON(storms: Storm[]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: storms.flatMap(stormToPointFeatures),
  };
}

function createTracksGeoJSON(storms: Storm[]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: storms.map(stormToLineFeature),
  };
}

async function main() {
  console.log('Fetching HURDAT2 data from NOAA...');
  const data = await fetchHurdat2();
  console.log(`Fetched ${data.length} bytes`);

  console.log('Parsing HURDAT2 data...');
  const storms = parseHurdat2(data);
  console.log(`Parsed ${storms.length} storms`);

  // Filter to Atlantic only
  const atlanticStorms = storms.filter(s => s.basin === 'AL');
  console.log(`Atlantic storms: ${atlanticStorms.length}`);

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Export storms.json
  const stormsPath = `${OUTPUT_DIR}/storms.json`;
  const stormsData = atlanticStorms.map(s => ({
    id: s.id,
    name: s.name,
    year: s.year,
    maxWind: s.maxWind,
    minPressure: s.minPressure,
    category: s.category,
    trackPointCount: s.track.length,
  }));
  await writeFile(stormsPath, JSON.stringify(stormsData, null, 2));
  console.log(`Wrote ${stormsPath}`);

  // Export tracks.geojson (with temporal metadata)
  const tracksPath = `${OUTPUT_DIR}/tracks.geojson`;
  const tracksGeoJSON = createTracksGeoJSON(atlanticStorms);
  await writeFile(tracksPath, JSON.stringify(tracksGeoJSON));
  console.log(`Wrote ${tracksPath}`);

  // Export points.geojson (individual timestamped positions for animation)
  const pointsPath = `${OUTPUT_DIR}/points.geojson`;
  const pointsGeoJSON = createPointsGeoJSON(atlanticStorms);
  await writeFile(pointsPath, JSON.stringify(pointsGeoJSON));
  console.log(`Wrote ${pointsPath} (${pointsGeoJSON.features.length} points)`);

  // Stats
  const byCategory = atlanticStorms.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  console.log('\nStorms by category:');
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`  Cat ${cat}: ${count}`);
  }

  const years = atlanticStorms.map(s => s.year);
  console.log(`\nYear range: ${Math.min(...years)} - ${Math.max(...years)}`);
}

main().catch(console.error);
