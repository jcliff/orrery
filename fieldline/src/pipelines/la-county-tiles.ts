import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTiles } from './lib/generate-tiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

generateTiles({
  name: 'LA County',
  inputPath: join(__dirname, '../../../chrona/public/data/la-county/parcels-detailed.ndjson'),
  outputDir: join(__dirname, '../../../chrona/public/data/la-county'),
  layerName: 'parcels',
  isNdjson: true,
}).catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
