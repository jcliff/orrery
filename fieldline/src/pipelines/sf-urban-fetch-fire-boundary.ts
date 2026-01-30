/**
 * Fetch 1906 San Francisco earthquake fire boundary from DataSF.
 *
 * This downloads the official GIS boundary of areas destroyed by fire
 * following the April 18, 1906 earthquake. The boundary was digitized
 * from a historic R.J. Waters & Co. map.
 *
 * Source: https://data.sfgov.org/-/Areas-Damaged-by-Fire-Following-1906-Earthquake/yk2r-b4e8
 * Dataset UID: ff3a-iqhv
 */

import { writeFile, mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/sf-urban', import.meta.url).pathname;
const OUTPUT_FILE = 'fire-boundary-1906.geojson';

// DataSF GeoJSON export endpoint
const API_URL = 'https://data.sfgov.org/api/geospatial/ff3a-iqhv?method=export&format=GeoJSON';

async function main() {
  console.log('Fetching 1906 San Francisco fire boundary...');
  console.log(`Source: ${API_URL}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const geojson = await res.json();

  // Validate structure
  if (!geojson.type || !geojson.features) {
    throw new Error('Invalid GeoJSON response');
  }

  const feature = geojson.features[0];
  if (!feature?.geometry) {
    throw new Error('No geometry found in response');
  }

  console.log('Fire boundary metadata:');
  console.log(`  Type: ${feature.geometry.type}`);
  if (feature.geometry.type === 'Polygon') {
    console.log(`  Rings: ${feature.geometry.coordinates.length}`);
    console.log(`  Outer ring points: ${feature.geometry.coordinates[0]?.length}`);
  } else if (feature.geometry.type === 'MultiPolygon') {
    console.log(`  Polygons: ${feature.geometry.coordinates.length}`);
  }

  // Log any properties from the source
  if (feature.properties) {
    console.log('  Properties:', JSON.stringify(feature.properties, null, 2));
  }

  // Write the full GeoJSON FeatureCollection
  const outputPath = `${OUTPUT_DIR}/${OUTPUT_FILE}`;
  await writeFile(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`\nWrote ${outputPath}`);

  // Also extract just the boundary polygon for efficient loading
  const boundaryOnly = {
    type: 'Feature' as const,
    properties: {
      name: '1906 San Francisco Fire Boundary',
      source: 'DataSF',
      dataset_uid: 'ff3a-iqhv',
      description: 'Areas damaged by fire following the April 18, 1906 earthquake',
      fetched_at: new Date().toISOString(),
    },
    geometry: feature.geometry,
  };

  const boundaryPath = `${OUTPUT_DIR}/fire-boundary-1906-polygon.json`;
  await writeFile(boundaryPath, JSON.stringify(boundaryOnly, null, 2));
  console.log(`Wrote ${boundaryPath} (polygon only)`);
}

main().catch(console.error);
