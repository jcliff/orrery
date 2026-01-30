import { writeFile, mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/livermore', import.meta.url).pathname;
const API_URL = 'https://gis.cityoflivermore.net/arcgis/rest/services/Parcels/FeatureServer/0/query';
const BATCH_SIZE = 2000;
const OUT_FIELDS = [
  'APN',
  'YrBuilt',
  'EffYr',
  'SitusNum',
  'SitusStreet',
  'SitusCity',
  'LandUseDescription',
  'LandUseCategory',
  'LotSize',
  'BldgArea',
  'Stories',
  'Beds',
  'Baths',
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

async function fetchBatch(offset: number): Promise<ArcGISResponse> {
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
  console.log(`Fetching offset ${offset}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function main() {
  console.log('Fetching Livermore parcel data from ArcGIS REST API...');
  console.log(`Endpoint: ${API_URL}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

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

    offset += BATCH_SIZE;
    batchNum++;

    if (batchNum > 50) {
      console.log('Safety limit reached (50 batches)');
      break;
    }
  }

  const outputPath = `${OUTPUT_DIR}/parcels.geojson`;
  const combined = {
    type: 'FeatureCollection',
    features: allFeatures,
  };
  await writeFile(outputPath, JSON.stringify(combined));
  console.log(`\nWrote ${outputPath} (${total} parcels)`);
}

main().catch(console.error);
