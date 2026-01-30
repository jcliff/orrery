import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/nyc', import.meta.url).pathname;
const API_URL = 'https://data.cityofnewyork.us/resource/64uk-42ks.json';
const BATCH_SIZE = 50000; // Socrata allows up to 50k per request

// Key fields from PLUTO's 87 columns
const FIELDS = [
  'bbl',           // Borough-Block-Lot identifier
  'yearbuilt',
  'landuse',       // Land use category (1-11)
  'bldgclass',     // Building class
  'address',
  'zipcode',
  'borough',
  'block',
  'lot',
  'numfloors',
  'unitsres',      // Residential units
  'unitstotal',
  'lotarea',
  'bldgarea',
  'assesstot',     // Total assessed value
  'latitude',
  'longitude',
].join(',');

async function getRecordCount(): Promise<number> {
  const url = `${API_URL}?$select=count(*)`;
  const res = await fetch(url);
  const data = await res.json();
  return parseInt(data[0].count, 10) || 0;
}

async function fetchBatch(offset: number, retries = 3): Promise<unknown[]> {
  const params = new URLSearchParams({
    '$select': FIELDS,
    '$limit': BATCH_SIZE.toString(),
    '$offset': offset.toString(),
    '$order': 'bbl',
  });

  const url = `${API_URL}?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Retry ${attempt}/${retries} for offset ${offset}...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('Unreachable');
}

async function main() {
  console.log('Fetching NYC PLUTO data from Socrata API...');
  console.log(`Endpoint: ${API_URL}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const totalRecords = await getRecordCount();
  console.log(`Total records to fetch: ${totalRecords.toLocaleString()}`);
  console.log(`Estimated batches: ${Math.ceil(totalRecords / BATCH_SIZE)}\n`);

  const outputPath = `${OUTPUT_DIR}/pluto.ndjson`;
  const stream = createWriteStream(outputPath);

  let offset = 0;
  let batchNum = 0;
  let total = 0;
  const startTime = Date.now();

  while (total < totalRecords) {
    const records = await fetchBatch(offset);

    if (records.length === 0) {
      console.log('No more data returned');
      break;
    }

    for (const record of records) {
      stream.write(JSON.stringify(record) + '\n');
    }

    total += records.length;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = total / elapsed;
    const remaining = (totalRecords - total) / rate;

    console.log(
      `Batch ${batchNum}: ${total.toLocaleString()} / ${totalRecords.toLocaleString()} ` +
      `(${((total / totalRecords) * 100).toFixed(1)}%) - ` +
      `ETA: ${Math.round(remaining / 60)}min`
    );

    offset += BATCH_SIZE;
    batchNum++;

    // Small delay to be nice to the server
    await new Promise(r => setTimeout(r, 500));
  }

  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nWrote ${total.toLocaleString()} tax lots to ${outputPath}`);
  console.log(`Done in ${Math.round(elapsed / 60)} minutes`);
}

main().catch(console.error);
