import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTiles } from './lib/generate-tiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

generateTiles({
  name: 'Paris',
  inputPath: join(__dirname, '../../../chrona/public/data/paris/buildings-detailed.ndjson'),
  outputDir: join(__dirname, '../../../chrona/public/data/paris'),
  layerName: 'buildings',
  isNdjson: true,
}).catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
