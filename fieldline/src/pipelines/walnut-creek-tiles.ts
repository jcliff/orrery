import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTiles } from './lib/generate-tiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

generateTiles({
  name: 'Walnut Creek',
  inputPath: join(__dirname, '../../../chrona/public/data/walnut-creek/parcels-detailed.geojson'),
  outputDir: join(__dirname, '../../../chrona/public/data/walnut-creek'),
  layerName: 'parcels',
  isNdjson: false,
}).catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
