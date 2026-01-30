import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/paris', import.meta.url).pathname;

// APUR Emprise Batie Paris - ArcGIS REST API
// AN_CONST = year of construction, C_PERCONST = construction period code
const API_BASE = 'https://carto2.apur.org/apur/rest/services/OPENDATA/EMPRISE_BATIE_PARIS/MapServer/0/query';
const BATCH_SIZE = 2000;

async function getRecordCount(): Promise<number> {
  const url = `${API_BASE}?where=1%3D1&returnCountOnly=true&f=json`;
  const res = await fetch(url);
  const data = await res.json() as { count?: number };
  return data.count || 0;
}

interface FeatureCollection {
  type: string;
  features: unknown[];
  exceededTransferLimit?: boolean;
}

async function fetchBatch(offset: number, retries = 3): Promise<FeatureCollection> {
  // Build URL with manual encoding to avoid double-encoding
  const url = `${API_BASE}?where=1%3D1&outFields=OBJECTID,an_const,c_perconst,an_rehab,h_moy,c_morpho,c_tissu,Shape_Area&returnGeometry=true&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${BATCH_SIZE}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as FeatureCollection;
      return data;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Retry ${attempt}/${retries} for offset ${offset}...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('Unreachable');
}

async function main() {
  console.log('Fetching Paris building data from APUR...');
  console.log(`API: ${API_BASE}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const totalRecords = await getRecordCount();
  console.log(`Total buildings: ${totalRecords.toLocaleString()}`);
  console.log(`Estimated batches: ${Math.ceil(totalRecords / BATCH_SIZE)}\n`);

  const outputPath = `${OUTPUT_DIR}/buildings.ndjson`;
  const stream = createWriteStream(outputPath);

  let offset = 0;
  let batchNum = 0;
  let total = 0;
  const startTime = Date.now();

  while (total < totalRecords) {
    const batch = await fetchBatch(offset);

    if (!batch.features || batch.features.length === 0) {
      console.log(`No features at offset ${offset}, stopping`);
      break;
    }

    for (const feature of batch.features) {
      stream.write(JSON.stringify(feature) + '\n');
    }

    total += batch.features.length;

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

    // Check if server indicates more data
    if (!batch.exceededTransferLimit && batch.features.length < BATCH_SIZE) {
      console.log('Server indicates no more data');
      break;
    }

    // Small delay
    await new Promise(r => setTimeout(r, 300));
  }

  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\nWrote ${total.toLocaleString()} buildings to ${outputPath}`);
  console.log(`Done in ${Math.round(totalElapsed / 60)} minutes`);
}

main().catch(console.error);
