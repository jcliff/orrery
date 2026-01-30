import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUT_PATH = join(__dirname, '../../../chrona/public/data/railroads/segments.geojson');
const OUTPUT_DIR = join(__dirname, '../../../chrona/public/data/railroads');
const LAYER_NAME = 'segments';

function checkPrerequisites() {
  try {
    execSync('which tippecanoe', { stdio: 'pipe' });
  } catch {
    console.error('Error: tippecanoe is not installed.');
    console.error('Install with: brew install tippecanoe (macOS) or build from source');
    process.exit(1);
  }

  try {
    execSync('which pmtiles', { stdio: 'pipe' });
  } catch {
    console.error('Error: pmtiles CLI is not installed.');
    console.error('Install with: go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest');
    process.exit(1);
  }

  if (!existsSync(INPUT_PATH)) {
    console.error(`Error: Input file not found: ${INPUT_PATH}`);
    console.error('Run pipeline:railroads first to generate the GeoJSON');
    process.exit(1);
  }
}

async function main() {
  console.log('Railroads Tiles Pipeline');
  console.log('========================\n');

  checkPrerequisites();

  const mbtilesPath = `${OUTPUT_DIR}/${LAYER_NAME}.mbtiles`;
  const pmtilesPath = `${OUTPUT_DIR}/${LAYER_NAME}.pmtiles`;

  console.log(`Input: ${INPUT_PATH}`);
  console.log(`Output: ${pmtilesPath}\n`);

  // Step 1: Generate MBTiles with tippecanoe
  // Using zoom 4-12 since this is a national-scale visualization
  console.log('Step 1: Generating vector tiles with tippecanoe...');
  const tippecanoeArgs = [
    'tippecanoe',
    `-o "${mbtilesPath}"`,
    '--force',
    '-z 12',  // Max zoom - enough detail for state-level
    '-Z 4',   // Min zoom - national view
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--attribute-type=year:int',
    '--attribute-type=miles:float',
    '--attribute-type=gauge:float',
    `-l ${LAYER_NAME}`,
    `"${INPUT_PATH}"`,
  ].join(' ');

  console.log(`  Running: ${tippecanoeArgs}\n`);
  execSync(tippecanoeArgs, { stdio: 'inherit' });

  // Step 2: Convert MBTiles to PMTiles
  console.log('\nStep 2: Converting to PMTiles format...');
  const pmtilesCmd = `pmtiles convert "${mbtilesPath}" "${pmtilesPath}"`;
  console.log(`  Running: ${pmtilesCmd}\n`);
  execSync(pmtilesCmd, { stdio: 'inherit' });

  // Clean up intermediate MBTiles file
  console.log('\nStep 3: Cleaning up intermediate files...');
  execSync(`rm "${mbtilesPath}"`);

  console.log('\nDone!');
  console.log(`Output: ${pmtilesPath}`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
