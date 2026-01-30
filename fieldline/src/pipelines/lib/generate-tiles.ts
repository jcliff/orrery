import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export interface TilesConfig {
  name: string;
  inputPath: string;
  outputDir: string;
  layerName: string;
  isNdjson?: boolean;  // Use -P flag for parallel NDJSON reading
  minZoom?: number;
  maxZoom?: number;
}

function checkPrerequisites(inputPath: string) {
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

  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }
}

export async function generateTiles(config: TilesConfig): Promise<void> {
  const {
    name,
    inputPath,
    outputDir,
    layerName,
    isNdjson = false,
    minZoom = 12,
    maxZoom = 18,
  } = config;

  const mbtilesPath = `${outputDir}/${layerName}.mbtiles`;
  const pmtilesPath = `${outputDir}/${layerName}.pmtiles`;

  console.log(`${name} Tiles Pipeline`);
  console.log('='.repeat(name.length + 16) + '\n');

  checkPrerequisites(inputPath);

  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${pmtilesPath}\n`);

  // Step 1: Generate MBTiles with tippecanoe
  console.log('Step 1: Generating vector tiles with tippecanoe...');
  const tippecanoeArgs = [
    'tippecanoe',
    `-o "${mbtilesPath}"`,
    '--force',
    `-z ${maxZoom}`,
    `-Z ${minZoom}`,
    isNdjson ? '-P' : '',  // Parallel read for NDJSON
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--attribute-type=year:int',
    '--attribute-type=estimated:bool',
    '--attribute-type=area:int',
    `-l ${layerName}`,
    `"${inputPath}"`,
  ].filter(Boolean).join(' ');

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
