/**
 * Santa Rosa parcel fetch pipeline.
 * Uses the common parallel fetcher with ArcGIS adapter.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { parallelFetch, createArcGISFetcher } from '../core/fetcher.js';
import { getCache, geoJsonFeatureId } from '../core/cache.js';
import { getSource } from '../registry/sources.js';

const OUTPUT_DIR = new URL('../../data/raw/santa-rosa', import.meta.url).pathname;
const SOURCE = getSource('santa-rosa');

async function main() {
  console.log(`Fetching ${SOURCE.name} from ${SOURCE.attribution}...`);
  console.log(`Endpoint: ${(SOURCE.api as { url: string }).url}\n`);

  // Check cache first
  const cache = await getCache();
  const meta = cache.getSourceMetadata(SOURCE.id);

  if (meta && !cache.needsRefresh(SOURCE.id, 24)) {
    console.log(
      `Using cached data (${meta.recordCount.toLocaleString()} records from ${meta.lastFetched})`
    );
    const cached = cache.getFeatures<GeoJSON.Feature>(SOURCE.id);

    await mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/parcels.geojson`;
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cached,
    };
    await writeFile(outputPath, JSON.stringify(geojson));
    console.log(`Wrote ${outputPath} (${cached.length} parcels from cache)`);
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Create fetcher from source registry
  const api = SOURCE.api as { type: 'arcgis'; url: string; outFields: string[]; where?: string };
  const fetcher = createArcGISFetcher(api.url, api.outFields, api.where);

  // Fetch with parallel batching
  const result = await parallelFetch<GeoJSON.Feature>(fetcher, {
    concurrency: 4,
    batchSize: 1000,
    maxBatches: 100,
    onProgress: (progress) => {
      console.log(`  ${progress.message}`);
    },
  });

  console.log(`\nFetched ${result.totalFetched.toLocaleString()} features`);

  // Cache the results
  cache.upsertFeatures(SOURCE.id, result.features, (f, i) =>
    geoJsonFeatureId(f, i, 'APN')
  );
  cache.updateSourceMetadata(SOURCE.id, {
    recordCount: result.totalFetched,
  });

  // Write combined GeoJSON
  const outputPath = `${OUTPUT_DIR}/parcels.geojson`;
  const combined: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: result.features,
  };
  await writeFile(outputPath, JSON.stringify(combined));
  console.log(`Wrote ${outputPath} (${result.totalFetched} parcels)`);
}

main().catch(console.error);
