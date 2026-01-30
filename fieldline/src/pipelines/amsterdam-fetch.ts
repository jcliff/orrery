import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/amsterdam', import.meta.url).pathname;

// PDOK BAG OGC API - Dutch national building registry
// bouwjaar = construction year
const API_BASE = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items';
const BATCH_SIZE = 1000; // API max is 1000

// Amsterdam bounding box (WGS84)
const BBOX = '4.7,52.28,5.1,52.45';

interface OGCResponse {
  type: string;
  features: unknown[];
  numberReturned: number;
  links: Array<{ rel: string; href: string }>;
}

async function fetchPage(url: string, retries = 3): Promise<OGCResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
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
  console.log('Fetching Amsterdam building data from PDOK BAG...');
  console.log(`API: ${API_BASE}`);
  console.log(`Bounding box: ${BBOX}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // First request - OGC API uses cursor-based pagination via "next" links
  let url = `${API_BASE}?bbox=${BBOX}&limit=${BATCH_SIZE}&f=json`;

  const outputPath = `${OUTPUT_DIR}/buildings.ndjson`;
  const stream = createWriteStream(outputPath);

  let total = 0;
  let batchNum = 0;
  const startTime = Date.now();

  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const page = await fetchPage(nextUrl);

    if (page.features.length === 0) {
      console.log('No more data returned');
      break;
    }

    for (const feature of page.features) {
      stream.write(JSON.stringify(feature) + '\n');
    }

    total += page.features.length;

    const elapsedNow = (Date.now() - startTime) / 1000;
    const rate = total / elapsedNow;

    console.log(
      `Batch ${batchNum}: ${total.toLocaleString()} buildings fetched ` +
      `(${Math.round(rate)}/sec)`
    );

    nextUrl = page.links.find(l => l.rel === 'next')?.href;
    batchNum++;

    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 200));
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
