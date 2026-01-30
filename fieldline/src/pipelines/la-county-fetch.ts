import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/la-county', import.meta.url).pathname;
const API_URL = 'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/LA_County_Parcels/FeatureServer/0/query';
const BATCH_SIZE = 2000;

// Select key fields - LA County has 126 fields, we only need essential ones
const OUT_FIELDS = [
  'APN',
  'YearBuilt1',
  'EffectiveYear1',
  'UseCode',
  'UseType',
  'UseDescription',
  'SitusFullAddress',
  'SitusCity',
  'SitusZIP',
  'SQFTmain1',
  'Units1',
  'Bedrooms1',
  'Bathrooms1',
  'Roll_LandValue',
  'Roll_ImpValue',
].join(',');

interface ArcGISResponse {
  type: 'FeatureCollection';
  features: unknown[];
  exceededTransferLimit?: boolean;
}

async function getRecordCount(): Promise<number> {
  const params = new URLSearchParams({
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });

  const url = `${API_URL}?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.count || 0;
}

async function fetchBatch(offset: number, retries = 3): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultOffset: offset.toString(),
    resultRecordCount: BATCH_SIZE.toString(),
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

// Stream features to file as NDJSON to avoid memory issues
function writeFeaturesToStream(stream: WriteStream, features: unknown[]): void {
  for (const feature of features) {
    stream.write(JSON.stringify(feature) + '\n');
  }
}

async function main() {
  console.log('Fetching LA County parcel data from ArcGIS REST API...');
  console.log(`Endpoint: ${API_URL}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const totalRecords = await getRecordCount();
  console.log(`Total records to fetch: ${totalRecords.toLocaleString()}`);
  console.log(`Estimated batches: ${Math.ceil(totalRecords / BATCH_SIZE)}\n`);

  // Write as NDJSON to avoid memory issues with 2.4M features
  const outputPath = `${OUTPUT_DIR}/parcels.ndjson`;
  const stream = createWriteStream(outputPath);

  let offset = 0;
  let batchNum = 0;
  let total = 0;
  const startTime = Date.now();

  while (total < totalRecords) {
    const data = await fetchBatch(offset);
    const features = data.features || [];

    if (features.length === 0) {
      console.log('No more data returned');
      break;
    }

    writeFeaturesToStream(stream, features);
    total += features.length;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = total / elapsed;
    const remaining = (totalRecords - total) / rate;

    if (batchNum % 50 === 0 || total >= totalRecords) {
      console.log(
        `Batch ${batchNum}: ${total.toLocaleString()} / ${totalRecords.toLocaleString()} ` +
        `(${((total / totalRecords) * 100).toFixed(1)}%) - ` +
        `ETA: ${Math.round(remaining / 60)}min`
      );
    }

    offset += BATCH_SIZE;
    batchNum++;

    // Small delay to be nice to the server
    if (batchNum % 10 === 0) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Close the stream
  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nWrote ${total.toLocaleString()} parcels to ${outputPath}`);
  console.log(`Done in ${Math.round(elapsed / 60)} minutes`);
}

main().catch(console.error);
