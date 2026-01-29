import { writeFile, mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/sf-urban', import.meta.url).pathname;
const API_URL = 'https://data.sfgov.org/resource/wv5m-vpq2.json';
const BATCH_SIZE = 50000;
const FIELDS = [
  'parcel_number',
  'year_property_built',
  'use_definition',
  'the_geom',
  'analysis_neighborhood',
  'property_location',
].join(',');

async function fetchBatch(offset: number): Promise<unknown[]> {
  // Filter to 2024 tax year to get unique properties (not duplicates across years)
  // Include ALL parcels - even those without year_property_built (we'll estimate those)
  const where = encodeURIComponent("closed_roll_year='2024' AND the_geom IS NOT NULL");
  const url = `${API_URL}?$select=${FIELDS}&$limit=${BATCH_SIZE}&$offset=${offset}&$where=${where}`;
  console.log(`Fetching offset ${offset}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function main() {
  console.log('Fetching SF parcel data with addresses...');

  await mkdir(OUTPUT_DIR, { recursive: true });

  let offset = 0;
  let batchNum = 0;
  let total = 0;

  while (true) {
    const data = await fetchBatch(offset);

    if (data.length === 0) {
      console.log('No more data');
      break;
    }

    const outputPath = `${OUTPUT_DIR}/sf_parcels_${batchNum}.json`;
    await writeFile(outputPath, JSON.stringify(data));
    console.log(`Wrote ${outputPath} (${data.length} records)`);

    total += data.length;
    offset += BATCH_SIZE;
    batchNum++;

    if (data.length < BATCH_SIZE) {
      console.log('Last batch (partial)');
      break;
    }
  }

  console.log(`\nTotal: ${total} parcels in ${batchNum} files`);
}

main().catch(console.error);
