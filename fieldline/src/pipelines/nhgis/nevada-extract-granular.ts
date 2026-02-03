/**
 * Nevada NHGIS extract pipeline - Granular geographies.
 *
 * Submits extract requests to NHGIS for:
 * - Census tracts (2000-2020)
 * - Places/cities (1970-2020)
 *
 * Usage:
 *   NHGIS_API_KEY=your_key pnpm --filter fieldline pipeline:nhgis-nevada-extract-granular
 */

import { mkdir } from 'node:fs/promises';
import {
  createClient,
  type ExtractDataset,
} from './lib/nhgis-client.js';
import {
  TRACT_DATASETS,
  PLACE_DATASETS,
  TOTAL_POP_TABLES,
} from './lib/variable-mapping.js';

const OUTPUT_DIR_TRACTS = new URL('../../data/raw/nhgis/nevada-tracts', import.meta.url).pathname;
const OUTPUT_DIR_PLACES = new URL('../../data/raw/nhgis/nevada-places', import.meta.url).pathname;

async function main() {
  console.log('NHGIS Nevada Granular Extract Pipeline');
  console.log('=======================================\n');

  const client = createClient();

  // Build tract datasets (2000-2020)
  const tractDatasets: ExtractDataset[] = [];
  console.log('Census Tracts (2000-2020):');
  for (const [yearStr, datasetName] of Object.entries(TRACT_DATASETS)) {
    const year = parseInt(yearStr, 10);
    const popTable = TOTAL_POP_TABLES[year];
    if (popTable) {
      tractDatasets.push({
        name: datasetName,
        dataTables: [popTable],
        geogLevels: ['tract'],
      });
      console.log(`  ${year}: ${datasetName} [${popTable}] at tract level`);
    }
  }

  // Build place datasets (1970-2020)
  const placeDatasets: ExtractDataset[] = [];
  console.log('\nPlaces/Cities (1970-2020):');
  for (const [yearStr, datasetName] of Object.entries(PLACE_DATASETS)) {
    const year = parseInt(yearStr, 10);
    const popTable = TOTAL_POP_TABLES[year];
    if (popTable) {
      placeDatasets.push({
        name: datasetName,
        dataTables: [popTable],
        geogLevels: ['place'],
      });
      console.log(`  ${year}: ${datasetName} [${popTable}] at place level`);
    }
  }

  // Submit tract extract
  console.log('\n--- Submitting tract extract ---');
  const { number: tractExtractNum } = await client.submitExtract({
    description: 'Nevada census tracts 2000-2020',
    datasets: tractDatasets,
    dataFormat: 'csv_header',
  });
  console.log(`Tract extract #${tractExtractNum} submitted`);

  // Submit place extract
  console.log('\n--- Submitting place extract ---');
  const { number: placeExtractNum } = await client.submitExtract({
    description: 'Nevada places/cities 1970-2020',
    datasets: placeDatasets,
    dataFormat: 'csv_header',
  });
  console.log(`Place extract #${placeExtractNum} submitted`);

  // Wait for both extracts
  console.log('\n--- Waiting for extracts to complete ---');
  console.log('(This may take several minutes...)\n');

  const [tractStatus, placeStatus] = await Promise.all([
    client.waitForCompletion(tractExtractNum),
    client.waitForCompletion(placeExtractNum),
  ]);

  console.log(`Tract extract: ${tractStatus.status}`);
  console.log(`Place extract: ${placeStatus.status}`);

  // Download files to separate directories
  await mkdir(OUTPUT_DIR_TRACTS, { recursive: true });
  await mkdir(OUTPUT_DIR_PLACES, { recursive: true });

  console.log('\n--- Downloading tract data ---');
  const tractFiles = await client.download(tractExtractNum, OUTPUT_DIR_TRACTS);
  console.log(`Downloaded ${tractFiles.length} files to ${OUTPUT_DIR_TRACTS}`);

  console.log('\n--- Downloading place data ---');
  const placeFiles = await client.download(placeExtractNum, OUTPUT_DIR_PLACES);
  console.log(`Downloaded ${placeFiles.length} files to ${OUTPUT_DIR_PLACES}`);

  // Unzip files
  console.log('\n--- Extracting zip files ---');
  const { execSync } = await import('node:child_process');

  for (const file of [...tractFiles, ...placeFiles]) {
    if (file.endsWith('.zip')) {
      const extractDir = file.replace('.zip', '');
      console.log(`  Extracting ${file.split('/').pop()}...`);
      execSync(`unzip -o "${file}" -d "${extractDir}"`, { stdio: 'pipe' });
    }
  }

  console.log('\nExtract complete!');
  console.log(`\nNext steps:`);
  console.log(`  1. Process tracts: pnpm --filter fieldline pipeline:nhgis-nevada-tracts`);
  console.log(`  2. Process places: pnpm --filter fieldline pipeline:nhgis-nevada-places`);
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.response) {
    console.error('Response:', JSON.stringify(err.response, null, 2));
  }
  process.exit(1);
});
