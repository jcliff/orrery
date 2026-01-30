import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/copenhagen', import.meta.url).pathname;

// Copenhagen Municipality (Københavns Kommune) WFS - Public building data with BBR info
// bygning_kk layer has opfoerelse_aar (construction year) and byganvendelsekode (use code)
const API_BASE = 'https://wfs-kbhkort.kk.dk/k101/ows';
const LAYER_NAME = 'k101:bygning_kk';
const BATCH_SIZE = 1000;

interface WFSResponse {
  type: string;
  features: Array<{
    properties: Record<string, unknown>;
    geometry: unknown;
  }>;
  numberMatched?: number;
  numberReturned?: number;
  totalFeatures?: number;
}

async function getRecordCount(): Promise<number> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: LAYER_NAME,
    resultType: 'hits',
  });
  const url = `${API_BASE}?${params}`;
  const res = await fetch(url);
  const text = await res.text();
  // Parse numberMatched from XML response
  const match = text.match(/numberMatched="(\d+)"/);
  return match ? parseInt(match[1], 10) : 0;
}

async function fetchPage(startIndex: number, retries = 3): Promise<WFSResponse> {
  // WFS 2.0 GetFeature request
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: LAYER_NAME,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    startIndex: startIndex.toString(),
    count: BATCH_SIZE.toString(),
  });

  const url = `${API_BASE}?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Retry ${attempt}/${retries}...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('Unreachable');
}

async function main() {
  console.log('Fetching Copenhagen building data from Københavns Kommune WFS...');
  console.log(`API: ${API_BASE}`);
  console.log(`Layer: ${LAYER_NAME}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const totalRecords = await getRecordCount();
  console.log(`Total buildings: ${totalRecords.toLocaleString()}`);
  console.log(`Estimated batches: ${Math.ceil(totalRecords / BATCH_SIZE)}\n`);

  const outputPath = `${OUTPUT_DIR}/buildings.ndjson`;
  const stream = createWriteStream(outputPath);

  let startIndex = 0;
  let batchNum = 0;
  let total = 0;
  const startTime = Date.now();

  while (true) {
    const page = await fetchPage(startIndex);

    if (!page.features || page.features.length === 0) {
      console.log('No more data returned');
      break;
    }

    for (const feature of page.features) {
      stream.write(JSON.stringify(feature) + '\n');
    }

    total += page.features.length;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = total / elapsed;
    const remaining = (totalRecords - total) / rate;

    console.log(
      `Batch ${batchNum}: ${total.toLocaleString()} / ${totalRecords.toLocaleString()} ` +
      `(${((total / totalRecords) * 100).toFixed(1)}%) - ` +
      `ETA: ${Math.round(remaining / 60)}min`
    );

    // Check if we got fewer than batch size (last page)
    if (page.features.length < BATCH_SIZE) {
      console.log('Reached end of data');
      break;
    }

    startIndex += BATCH_SIZE;
    batchNum++;

    // Small delay to be nice to the API
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
