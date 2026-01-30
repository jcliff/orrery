import { writeFile, mkdir, open } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/clark-county', import.meta.url).pathname;
const BATCH_SIZE = 2000;

// Clark County ArcGIS REST endpoints
const PARCELS_URL = 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/ParcelHistory/MapServer/0/query';
const PARCEL_POLYGONS_URL = 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Layers/MapServer/1/query';
const SUBDIVISIONS_URL = 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/AOSubdivisions/MapServer/0/query';

// Added parcels by year (these have actual dates)
const ADDED_LAYERS = [
  { year: 2017, url: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2017/MapServer/0/query' },
  { year: 2018, url: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2018/MapServer/0/query' },
  { year: 2019, url: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2019/MapServer/0/query' },
  { year: 2020, url: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2020/MapServer/0/query' },
  { year: 2021, url: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/added_current/FeatureServer/0/query' },
];

interface ArcGISResponse {
  type?: 'FeatureCollection';
  features: unknown[];
  exceededTransferLimit?: boolean;
}

async function getRecordCount(baseUrl: string): Promise<number> {
  const params = new URLSearchParams({
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });

  const url = `${baseUrl}?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.count || 0;
}

async function fetchBatch(baseUrl: string, offset: number, outFields: string): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultOffset: offset.toString(),
    resultRecordCount: BATCH_SIZE.toString(),
  });

  const url = `${baseUrl}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function fetchAllFeatures(
  baseUrl: string,
  outFields: string,
  label: string,
  maxBatches = 500
): Promise<unknown[]> {
  const totalRecords = await getRecordCount(baseUrl);
  console.log(`${label}: ${totalRecords.toLocaleString()} records`);

  let offset = 0;
  let batchNum = 0;
  const allFeatures: unknown[] = [];

  while (offset < totalRecords && batchNum < maxBatches) {
    const data = await fetchBatch(baseUrl, offset, outFields);
    const features = data.features || [];

    if (features.length === 0) break;

    allFeatures.push(...features);
    process.stdout.write(`\r  Fetched ${allFeatures.length.toLocaleString()} / ${totalRecords.toLocaleString()}`);

    offset += BATCH_SIZE;
    batchNum++;
  }

  console.log(); // newline
  return allFeatures;
}

// Stream features directly to file to avoid memory issues with large datasets
async function fetchAndStreamToFile(
  baseUrl: string,
  outFields: string,
  label: string,
  outputPath: string,
  maxBatches = 500
): Promise<number> {
  const totalRecords = await getRecordCount(baseUrl);
  console.log(`${label}: ${totalRecords.toLocaleString()} records`);

  const file = await open(outputPath, 'w');
  await file.write('{"type":"FeatureCollection","features":[');

  let offset = 0;
  let batchNum = 0;
  let totalFetched = 0;
  let isFirst = true;

  while (offset < totalRecords && batchNum < maxBatches) {
    const data = await fetchBatch(baseUrl, offset, outFields);
    const features = data.features || [];

    if (features.length === 0) break;

    for (const feature of features) {
      if (!isFirst) {
        await file.write(',');
      }
      await file.write(JSON.stringify(feature));
      isFirst = false;
    }

    totalFetched += features.length;
    process.stdout.write(`\r  Fetched ${totalFetched.toLocaleString()} / ${totalRecords.toLocaleString()}`);

    offset += BATCH_SIZE;
    batchNum++;
  }

  await file.write(']}');
  await file.close();

  console.log(); // newline
  return totalFetched;
}

async function main() {
  console.log('Fetching Clark County data from ArcGIS REST APIs...\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  // 1. Fetch parcel polygons (full geometry) - stream to file due to size
  console.log('=== Parcel Polygons ===');
  const polygonFields = 'APN,PARCELTYPE,Label_Class,ASSR_ACRES';
  const polygonsPath = `${OUTPUT_DIR}/parcel-polygons.geojson`;
  const polygonCount = await fetchAndStreamToFile(PARCEL_POLYGONS_URL, polygonFields, 'Parcel Polygons', polygonsPath, 600);
  console.log(`  Wrote ${polygonsPath} (${polygonCount.toLocaleString()} polygons)\n`);

  // 2. Fetch parcel points (for quick spatial joins)
  console.log('=== Parcel Points ===');
  const parcelFields = 'APN,PARCELTYPE,TAX_DIST,CALC_ACRES,ASSR_ACRES,Label_Class';
  const parcels = await fetchAllFeatures(PARCELS_URL, parcelFields, 'Parcels', 600);

  const parcelsPath = `${OUTPUT_DIR}/parcels.geojson`;
  await writeFile(parcelsPath, JSON.stringify({
    type: 'FeatureCollection',
    features: parcels,
  }));
  console.log(`  Wrote ${parcelsPath}\n`);

  // 3. Fetch subdivisions with geometry (for spatial join)
  console.log('=== Subdivisions ===');
  const subFields = 'SubName,Doc_Num,Map_Book,Map_Page,Map_Type';
  const subdivisions = await fetchAllFeatures(SUBDIVISIONS_URL, subFields, 'Subdivisions', 100);

  const subdivisionsPath = `${OUTPUT_DIR}/subdivisions.geojson`;
  await writeFile(subdivisionsPath, JSON.stringify({
    type: 'FeatureCollection',
    features: subdivisions,
  }));
  console.log(`  Wrote ${subdivisionsPath}\n`);

  // 4. Fetch dated parcels from Added layers
  console.log('=== Added Parcels (with dates) ===');
  const addedFields = 'apn,add_dt,src_yr,str_num,str,str_sfx,city,zip,asd_val,tax_val';
  const allAdded: unknown[] = [];

  for (const layer of ADDED_LAYERS) {
    try {
      const features = await fetchAllFeatures(layer.url, addedFields, `Added ${layer.year}`, 50);
      allAdded.push(...features);
    } catch (err) {
      console.log(`  Warning: Could not fetch Added ${layer.year}: ${err}`);
    }
  }

  const addedPath = `${OUTPUT_DIR}/added-parcels.geojson`;
  await writeFile(addedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: allAdded,
  }));
  console.log(`  Wrote ${addedPath} (${allAdded.length.toLocaleString()} total)\n`);

  console.log('Done fetching Clark County data!');
  console.log(`\nFiles written to ${OUTPUT_DIR}/`);
}

main().catch(console.error);
