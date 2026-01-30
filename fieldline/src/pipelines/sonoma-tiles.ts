import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTiles } from './lib/generate-tiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

generateTiles({
  name: 'Sonoma County',
  inputPath: join(__dirname, '../../../chrona/public/data/sonoma/parcels-detailed.geojson'),
  outputDir: join(__dirname, '../../../chrona/public/data/sonoma'),
  layerName: 'parcels',
  isNdjson: false,
}).catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
