import { writeFile, mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/solano', import.meta.url).pathname;
const API_URL = 'https://services2.arcgis.com/SCn6czzcqKAFwdGU/arcgis/rest/services/Parcels_Public_Aumentum/FeatureServer/0/query';
const BATCH_SIZE = 2000; // ArcGIS default max is often 2000
const OUT_FIELDS = [
  'parcelid',
  'yrbuilt',
  'sitecity',
  'sitenum',
  'siteroad',
  'usecode',
  'use_desc',
  'lotsize',
  'total_area',
  'stories',
  'bedroom',
  'bathroom',
].join(',');

interface ArcGISResponse {
  type: 'FeatureCollection';
  features: unknown[];
  exceededTransferLimit?: boolean;
}

async function fetchBatch(offset: number): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where: 'yrbuilt > 1800', // Only fetch parcels with valid year built
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326', // WGS84 lat/lon
    f: 'geojson',
    resultOffset: offset.toString(),
    resultRecordCount: BATCH_SIZE.toString(),
  });

  const url = `${API_URL}?${params}`;
  console.log(`Fetching offset ${offset}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function getRecordCount(): Promise<number> {
  const params = new URLSearchParams({
    where: 'yrbuilt > 1800',
    returnCountOnly: 'true',
    f: 'json',
  });

  const url = `${API_URL}?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.count || 0;
}

async function main() {
  console.log('Fetching Solano County parcel data from ArcGIS REST API...');
  console.log(`Endpoint: ${API_URL}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Get total count first
  const totalRecords = await getRecordCount();
  console.log(`Total records to fetch: ${totalRecords.toLocaleString()}\n`);

  let offset = 0;
  let batchNum = 0;
  let total = 0;
  const allFeatures: unknown[] = [];

  while (total < totalRecords) {
    const data = await fetchBatch(offset);
    const features = data.features || [];

    if (features.length === 0) {
      console.log('No more data returned');
      break;
    }

    allFeatures.push(...features);
    total += features.length;
    console.log(`  Batch ${batchNum}: ${features.length} features (total: ${total} / ${totalRecords})`);

    // Increment offset for pagination
    offset += BATCH_SIZE;
    batchNum++;

    // Safety limit
    if (batchNum > 100) {
      console.log('Safety limit reached (100 batches)');
      break;
    }
  }

  // Write combined GeoJSON
  const outputPath = `${OUTPUT_DIR}/parcels.geojson`;
  const combined = {
    type: 'FeatureCollection',
    features: allFeatures,
  };
  await writeFile(outputPath, JSON.stringify(combined));
  console.log(`\nWrote ${outputPath} (${total} parcels)`);
}

main().catch(console.error);
