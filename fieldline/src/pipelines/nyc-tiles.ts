import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Input: detailed NDJSON from nyc pipeline
const INPUT = join(__dirname, '../../../chrona/public/data/nyc/lots-detailed.ndjson');
// Output: PMTiles file for chrona app
const OUTPUT_DIR = join(__dirname, '../../../chrona/public/data/nyc');
const MBTILES_PATH = join(OUTPUT_DIR, 'lots.mbtiles');
const PMTILES_PATH = join(OUTPUT_DIR, 'lots.pmtiles');

function checkPrerequisites() {
  try {
    execSync('which tippecanoe', { stdio: 'pipe' });
  } catch {
    console.error('Error: tippecanoe is not installed.');
    console.error('Install with: brew install tippecanoe (macOS) or build from source');
    console.error('https://github.com/felt/tippecanoe');
    process.exit(1);
  }

  try {
    execSync('which pmtiles', { stdio: 'pipe' });
  } catch {
    console.error('Error: pmtiles CLI is not installed.');
    console.error('Install with: go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest');
    console.error('Or download from: https://github.com/protomaps/go-pmtiles/releases');
    process.exit(1);
  }

  if (!existsSync(INPUT)) {
    console.error(`Error: Input file not found: ${INPUT}`);
    console.error('Run the nyc pipeline first: pnpm --filter fieldline pipeline:nyc');
    process.exit(1);
  }
}

async function main() {
  console.log('NYC Tiles Pipeline');
  console.log('==================\n');

  checkPrerequisites();

  console.log(`Input: ${INPUT}`);
  console.log(`Output: ${PMTILES_PATH}\n`);

  // Step 1: Generate MBTiles with tippecanoe
  // Using -P for parallel reading of line-delimited GeoJSON (NDJSON)
  console.log('Step 1: Generating vector tiles with tippecanoe...');
  const tippecanoeCmd = [
    'tippecanoe',
    `-o "${MBTILES_PATH}"`,
    '--force', // Overwrite existing
    '-z 18',   // Max zoom
    '-Z 12',   // Min zoom (detailed view starts at 15, but we want some buffer)
    '-P',      // Parallel read for NDJSON
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--attribute-type=year:int',
    '--attribute-type=estimated:bool',
    '--attribute-type=area:int',
    '-l lots', // Layer name
    `"${INPUT}"`,
  ].join(' ');

  console.log(`  Running: ${tippecanoeCmd}\n`);
  execSync(tippecanoeCmd, { stdio: 'inherit' });

  // Step 2: Convert MBTiles to PMTiles
  console.log('\nStep 2: Converting to PMTiles format...');
  const pmtilesCmd = `pmtiles convert "${MBTILES_PATH}" "${PMTILES_PATH}"`;
  console.log(`  Running: ${pmtilesCmd}\n`);
  execSync(pmtilesCmd, { stdio: 'inherit' });

  // Clean up intermediate MBTiles file
  console.log('\nStep 3: Cleaning up intermediate files...');
  execSync(`rm "${MBTILES_PATH}"`);

  console.log('\nDone!');
  console.log(`Output: ${PMTILES_PATH}`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
