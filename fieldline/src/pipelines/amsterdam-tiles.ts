import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTiles } from './lib/generate-tiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

generateTiles({
  name: 'Amsterdam',
  inputPath: join(__dirname, '../../../chrona/public/data/amsterdam/buildings-detailed.ndjson'),
  outputDir: join(__dirname, '../../../chrona/public/data/amsterdam'),
  layerName: 'buildings',
  isNdjson: true,
}).catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
