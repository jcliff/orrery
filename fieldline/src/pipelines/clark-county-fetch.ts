/**
 * Clark County parcel fetch pipeline.
 * Uses multi-endpoint fetcher to combine data from multiple ArcGIS layers.
 */
import { writeFile, mkdir, open } from 'node:fs/promises';
import {
  parallelFetch,
  fetchMultiEndpoint,
  createArcGISFetcher,
  type EndpointConfig,
} from '../core/fetcher.js';
import { getCache } from '../core/cache.js';
import { getSource, CLARK_COUNTY_ENDPOINTS } from '../registry/sources.js';

const OUTPUT_DIR = new URL('../../data/raw/clark-county', import.meta.url).pathname;
const SOURCE = getSource('clark-county');
const BATCH_SIZE = 2000;

// Common fetch options
const fetchOptions = {
  batchSize: BATCH_SIZE,
  maxBatches: 600,
  retry: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
  },
};

// Stream features to GeoJSON file (for large datasets)
async function streamToGeoJSON(
  config: { type: 'arcgis'; url: string; outFields: string[]; where?: string },
  outputPath: string,
  label: string
): Promise<number> {
  const file = await open(outputPath, 'w');
  await file.write('{"type":"FeatureCollection","features":[');

  let totalFetched = 0;
  let isFirst = true;

  await parallelFetch<GeoJSON.Feature>(config, {
    ...fetchOptions,
    concurrency: 1, // Sequential for ordered output
    skipBuffer: true,
    onFeatures: async (features) => {
      for (const feature of features) {
        if (!isFirst) {
          await file.write(',');
        }
        await file.write(JSON.stringify(feature));
        isFirst = false;
      }
      totalFetched += features.length;
    },
    onProgress: (progress) => {
      process.stdout.write(
        `\r  ${label}: ${totalFetched.toLocaleString()} / ${progress.total?.toLocaleString() || '?'}`
      );
    },
  });

  await file.write(']}');
  await file.close();
  console.log(); // newline

  return totalFetched;
}

async function main() {
  console.log(`Fetching ${SOURCE.name} from ${SOURCE.attribution}...`);
  console.log(`Multi-endpoint source with ${Object.keys(CLARK_COUNTY_ENDPOINTS).length} layers\n`);

  // Check cache first
  const cache = await getCache();
  const meta = cache.getSourceMetadata(SOURCE.id);

  if (meta && !cache.needsRefresh(SOURCE.id, 24)) {
    console.log(
      `Using cached data (${meta.recordCount.toLocaleString()} records from ${meta.lastFetched})`
    );
    console.log('Note: To force refresh, clear cache or wait 24h');
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const startTime = Date.now();
  let totalRecords = 0;

  // 1. Fetch parcel polygons (full geometry) - stream to file due to size
  console.log('=== Parcel Polygons ===');
  const polygonFields = ['APN', 'PARCELTYPE', 'Label_Class', 'ASSR_ACRES'];
  const polygonsPath = `${OUTPUT_DIR}/parcel-polygons.geojson`;
  const polygonCount = await streamToGeoJSON(
    createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.polygons, polygonFields),
    polygonsPath,
    'Parcel Polygons'
  );
  console.log(`  Wrote ${polygonsPath} (${polygonCount.toLocaleString()} polygons)\n`);
  totalRecords += polygonCount;

  // 2. Fetch parcel points (for quick spatial joins)
  console.log('=== Parcel Points ===');
  const parcelFields = ['APN', 'PARCELTYPE', 'TAX_DIST', 'CALC_ACRES', 'ASSR_ACRES', 'Label_Class'];
  const parcelsResult = await parallelFetch<GeoJSON.Feature>(
    createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.parcels, parcelFields),
    {
      ...fetchOptions,
      concurrency: 4,
      onProgress: (progress) => {
        process.stdout.write(
          `\r  Parcels: ${progress.fetched.toLocaleString()} / ${progress.total?.toLocaleString() || '?'}`
        );
      },
    }
  );
  console.log();

  const parcelsPath = `${OUTPUT_DIR}/parcels.geojson`;
  await writeFile(
    parcelsPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: parcelsResult.features,
    })
  );
  console.log(`  Wrote ${parcelsPath} (${parcelsResult.totalFetched.toLocaleString()} points)\n`);
  totalRecords += parcelsResult.totalFetched;

  // 3. Fetch subdivisions with geometry (for spatial join)
  console.log('=== Subdivisions ===');
  const subFields = ['SubName', 'Doc_Num', 'Map_Book', 'Map_Page', 'Map_Type'];
  const subdivisionsResult = await parallelFetch<GeoJSON.Feature>(
    createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.subdivisions, subFields),
    {
      ...fetchOptions,
      maxBatches: 100,
      concurrency: 4,
      onProgress: (progress) => {
        process.stdout.write(
          `\r  Subdivisions: ${progress.fetched.toLocaleString()} / ${progress.total?.toLocaleString() || '?'}`
        );
      },
    }
  );
  console.log();

  const subdivisionsPath = `${OUTPUT_DIR}/subdivisions.geojson`;
  await writeFile(
    subdivisionsPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: subdivisionsResult.features,
    })
  );
  console.log(`  Wrote ${subdivisionsPath} (${subdivisionsResult.totalFetched.toLocaleString()} subdivisions)\n`);

  // 4. Fetch dated parcels from Added layers using multi-endpoint fetcher
  console.log('=== Added Parcels (with dates) ===');
  const addedFields = ['apn', 'add_dt', 'src_yr', 'str_num', 'str', 'str_sfx', 'city', 'zip', 'asd_val', 'tax_val'];

  const addedEndpoints: EndpointConfig[] = [
    {
      id: 'added-2017',
      config: createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.added2017, addedFields),
      optional: true,
      metadata: { sourceYear: 2017 },
    },
    {
      id: 'added-2018',
      config: createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.added2018, addedFields),
      optional: true,
      metadata: { sourceYear: 2018 },
    },
    {
      id: 'added-2019',
      config: createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.added2019, addedFields),
      optional: true,
      metadata: { sourceYear: 2019 },
    },
    {
      id: 'added-2020',
      config: createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.added2020, addedFields),
      optional: true,
      metadata: { sourceYear: 2020 },
    },
    {
      id: 'added-current',
      config: createArcGISFetcher(CLARK_COUNTY_ENDPOINTS.addedCurrent, addedFields),
      optional: true,
      metadata: { sourceYear: 2021 },
    },
  ];

  const addedResult = await fetchMultiEndpoint<GeoJSON.Feature>(
    {
      endpoints: addedEndpoints,
      merge: 'dedupe',
      idProperty: 'apn',
    },
    {
      ...fetchOptions,
      maxBatches: 50,
      concurrency: 4,
    }
  );

  const addedPath = `${OUTPUT_DIR}/added-parcels.geojson`;
  await writeFile(
    addedPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: addedResult.features,
    })
  );
  console.log(`  Wrote ${addedPath} (${addedResult.totalFetched.toLocaleString()} parcels)\n`);
  totalRecords += addedResult.totalFetched;

  // Report endpoint results
  console.log('Endpoint summary:');
  for (const [id, stats] of Object.entries(addedResult.byEndpoint)) {
    if (stats.error) {
      console.log(`  ${id}: FAILED - ${stats.error}`);
    } else {
      console.log(`  ${id}: ${stats.fetched.toLocaleString()} features`);
    }
  }

  // Update cache metadata
  cache.updateSourceMetadata(SOURCE.id, {
    recordCount: totalRecords,
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nDone fetching Clark County data!`);
  console.log(`Total: ${totalRecords.toLocaleString()} features in ${Math.round(elapsed / 60)} minutes`);
  console.log(`Files written to ${OUTPUT_DIR}/`);
}

main().catch(console.error);
