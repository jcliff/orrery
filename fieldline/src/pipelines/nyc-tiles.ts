import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTiles } from './lib/generate-tiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

generateTiles({
  name: 'NYC',
  inputPath: join(__dirname, '../../../chrona/public/data/nyc/lots-detailed.ndjson'),
  outputDir: join(__dirname, '../../../chrona/public/data/nyc'),
  layerName: 'lots',
  isNdjson: true,
}).catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
