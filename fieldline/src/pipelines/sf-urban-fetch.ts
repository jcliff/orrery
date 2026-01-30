/**
 * San Francisco urban buildings fetch pipeline.
 * Uses the common parallel fetcher with Socrata adapter.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { parallelFetch, createSocrataFetcher } from '../core/fetcher.js';
import { getCache } from '../core/cache.js';
import { getSource } from '../registry/sources.js';

const OUTPUT_DIR = new URL('../../data/raw/sf-urban', import.meta.url).pathname;
const SOURCE = getSource('sf-urban');

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
    const cached = cache.getFeatures<Record<string, unknown>>(SOURCE.id);

    await mkdir(OUTPUT_DIR, { recursive: true });

    // Write in batches like the original
    const BATCH_SIZE = 50000;
    for (let i = 0; i < cached.length; i += BATCH_SIZE) {
      const batch = cached.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE);
      const outputPath = `${OUTPUT_DIR}/sf_parcels_${batchNum}.json`;
      await writeFile(outputPath, JSON.stringify(batch));
      console.log(`Wrote ${outputPath} (${batch.length} records from cache)`);
    }
    console.log(`\nTotal: ${cached.length} parcels from cache`);
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Create fetcher from source registry
  const api = SOURCE.api as { type: 'socrata'; url: string; fields: string[]; where?: string };
  const fetcher = createSocrataFetcher(api.url, api.fields, api.where);

  // Fetch with sequential batching (Socrata doesn't support parallel well)
  const result = await parallelFetch<Record<string, unknown>>(fetcher, {
    concurrency: 1, // Sequential for Socrata
    batchSize: 50000,
    maxBatches: 20,
    onProgress: (progress) => {
      console.log(`  ${progress.message}`);
    },
  });

  console.log(`\nFetched ${result.totalFetched.toLocaleString()} records`);

  // Cache the results
  cache.upsertFeatures(SOURCE.id, result.features, (f, i) =>
    String(f.parcel_number || i)
  );
  cache.updateSourceMetadata(SOURCE.id, {
    recordCount: result.totalFetched,
  });

  // Write in batches
  const BATCH_SIZE = 50000;
  for (let i = 0; i < result.features.length; i += BATCH_SIZE) {
    const batch = result.features.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE);
    const outputPath = `${OUTPUT_DIR}/sf_parcels_${batchNum}.json`;
    await writeFile(outputPath, JSON.stringify(batch));
    console.log(`Wrote ${outputPath} (${batch.length} records)`);
  }

  console.log(`\nTotal: ${result.totalFetched} parcels in ${Math.ceil(result.features.length / BATCH_SIZE)} files`);
}

main().catch(console.error);
