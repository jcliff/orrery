/**
 * Nevada NHGIS tiles pipeline.
 *
 * Generates PMTiles from the processed GeoJSON data.
 *
 * Usage:
 *   pnpm --filter fieldline pipeline:nhgis-nevada-tiles
 */

import { generateTiles } from '../lib/generate-tiles.js';

const INPUT_PATH = new URL('../../../chrona/public/data/nhgis-nevada/counties.geojson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/nhgis-nevada', import.meta.url).pathname;

async function main() {
  await generateTiles({
    name: 'NHGIS Nevada Counties',
    inputPath: INPUT_PATH,
    outputDir: OUTPUT_DIR,
    layerName: 'counties',
    minZoom: 4,
    maxZoom: 10,
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
