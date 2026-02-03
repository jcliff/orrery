/**
 * Nevada NHGIS extract pipeline.
 *
 * Submits an extract request to NHGIS for Nevada county-level census data
 * from 1870-2020, then downloads the results.
 *
 * Usage:
 *   NHGIS_API_KEY=your_key pnpm --filter fieldline pipeline:nhgis-nevada-extract
 *
 * This script:
 * 1. Submits an extract request for all census decades
 * 2. Waits for the extract to be processed
 * 3. Downloads the CSV and shapefile data
 */

import { mkdir } from 'node:fs/promises';
import {
  createClient,
  type ExtractDataset,
} from './lib/nhgis-client.js';
import {
  getCensusYears,
  DATASETS_BY_YEAR,
  TOTAL_POP_TABLES,
  HOUSING_TABLES,
  SHAPEFILE_BY_YEAR,
} from './lib/variable-mapping.js';

const OUTPUT_DIR = new URL('../../data/raw/nhgis/nevada', import.meta.url).pathname;

async function main() {
  console.log('NHGIS Nevada Extract Pipeline');
  console.log('==============================\n');

  const client = createClient();
  const years = getCensusYears();

  console.log(`Requesting data for ${years.length} census years: ${years.join(', ')}\n`);

  // Build dataset configurations
  const datasets: ExtractDataset[] = [];
  const shapefiles: string[] = [];

  for (const year of years) {
    const datasetName = DATASETS_BY_YEAR[year];
    if (!datasetName) {
      console.warn(`  No dataset defined for year ${year}, skipping`);
      continue;
    }

    const dataTables: string[] = [];

    const popTable = TOTAL_POP_TABLES[year];
    if (popTable) dataTables.push(popTable);

    const housingTable = HOUSING_TABLES[year];
    if (housingTable) dataTables.push(housingTable);

    if (dataTables.length > 0) {
      datasets.push({
        name: datasetName,
        dataTables,
        geogLevels: ['county'],
      });
      console.log(`  ${year}: ${datasetName} with tables [${dataTables.join(', ')}]`);
    }

    const shapefileName = SHAPEFILE_BY_YEAR[year];
    if (shapefileName && !shapefiles.includes(shapefileName)) {
      shapefiles.push(shapefileName);
    }
  }

  console.log(`\nShapefiles: ${shapefiles.length} boundary files`);
  console.log(`Total datasets: ${datasets.length}\n`);

  // Submit extract request with historical boundary shapefiles
  const { number: extractNumber } = await client.submitExtract({
    description: 'Nevada county census data 1870-2020 with historical boundaries',
    datasets,
    dataFormat: 'csv_header',
    shapefiles,
  });

  console.log(`\nExtract #${extractNumber} submitted`);

  // Wait for completion
  const status = await client.waitForCompletion(extractNumber);
  console.log(`\nExtract completed with status: ${status.status}`);

  if (status.downloadLinks) {
    console.log('\nDownload links:');
    if (status.downloadLinks.tableData) console.log(`  Table data: ${status.downloadLinks.tableData}`);
    if (status.downloadLinks.gisData) console.log(`  GIS data: ${status.downloadLinks.gisData}`);
    if (status.downloadLinks.codebook) console.log(`  Codebook: ${status.downloadLinks.codebook}`);
  }

  // Download files
  await mkdir(OUTPUT_DIR, { recursive: true });
  const downloadedFiles = await client.download(extractNumber, OUTPUT_DIR);

  console.log(`\nDownloaded ${downloadedFiles.length} files to ${OUTPUT_DIR}`);

  // Unzip the files
  console.log('\nUnzipping downloaded files...');
  const { execSync } = await import('node:child_process');

  for (const file of downloadedFiles) {
    if (file.endsWith('.zip')) {
      const extractDir = file.replace('.zip', '');
      console.log(`  Extracting ${file}...`);
      execSync(`unzip -o "${file}" -d "${extractDir}"`, { stdio: 'pipe' });
    }
  }

  console.log('\nExtract complete!');
  console.log(`\nNext step: Run the process pipeline:`);
  console.log(`  pnpm --filter fieldline pipeline:nhgis-nevada`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
