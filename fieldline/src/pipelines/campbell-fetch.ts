import { writeFile, mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/campbell', import.meta.url).pathname;
const API_URL = 'https://gis.campbellca.gov/arcgis/rest/services/BaseFeatureLayers/ParcelsPublic/FeatureServer/0/query';
const BATCH_SIZE = 2000; // ArcGIS default max is often 2000
const OUT_FIELDS = [
  'APN',
  'YEAR_BUILT',
  'EFF_YEAR_BUILT',
  'UseCodeDescription',
  'SITUSFULL',
  'TTL_SQFT_ALL',
].join(',');

interface ArcGISResponse {
  type: 'FeatureCollection';
  features: unknown[];
  exceededTransferLimit?: boolean;
}

async function fetchBatch(offset: number): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where: '1=1',
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

async function main() {
  console.log('Fetching Campbell parcel data from ArcGIS REST API...');
  console.log(`Endpoint: ${API_URL}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  let offset = 0;
  let batchNum = 0;
  let total = 0;
  const allFeatures: unknown[] = [];

  while (true) {
    const data = await fetchBatch(offset);
    const features = data.features || [];

    if (features.length === 0) {
      console.log('No more data');
      break;
    }

    allFeatures.push(...features);
    total += features.length;
    console.log(`  Batch ${batchNum}: ${features.length} features (total: ${total})`);

    // Increment by actual features received (server may return less than requested)
    offset += features.length;
    batchNum++;

    // ArcGIS indicates more data available with exceededTransferLimit
    if (!data.exceededTransferLimit) {
      console.log('Transfer complete (no more data indicated)');
      break;
    }

    // Safety limit
    if (batchNum > 50) {
      console.log('Safety limit reached (50 batches)');
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
