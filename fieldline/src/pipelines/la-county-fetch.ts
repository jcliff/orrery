/**
 * LA County parcel fetch pipeline.
 * Uses the common parallel fetcher with streaming NDJSON output
 * to handle the 2.4M record dataset without memory issues.
 */
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { parallelFetch } from '../core/fetcher.js';
import { getCache, geoJsonFeatureId } from '../core/cache.js';
import { getSource } from '../registry/sources.js';

const OUTPUT_DIR = new URL('../../data/raw/la-county', import.meta.url).pathname;
const SOURCE = getSource('la-county');

// Stream features to file as NDJSON
function writeFeaturesToStream(stream: WriteStream, features: unknown[]): void {
  for (const feature of features) {
    stream.write(JSON.stringify(feature) + '\n');
  }
}

async function main() {
  console.log(`Fetching ${SOURCE.name} from ${SOURCE.attribution}...`);
  console.log(`Endpoint: ${(SOURCE.api as { url: string }).url}`);
  console.log(`Expected: ~${SOURCE.expectedCount?.toLocaleString()} records\n`);

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

  // Prepare streaming output
  const outputPath = `${OUTPUT_DIR}/parcels.ndjson`;
  const stream = createWriteStream(outputPath);
  let totalWritten = 0;
  const startTime = Date.now();

  // Create fetcher from source registry
  const api = SOURCE.api as { type: 'arcgis'; url: string; outFields: string[]; where?: string };

  // Use streaming fetch with NDJSON output
  const result = await parallelFetch<GeoJSON.Feature>(
    {
      type: 'arcgis',
      url: api.url,
      outFields: api.outFields,
      where: api.where || '1=1',
    },
    {
      concurrency: 1, // Sequential for ordered NDJSON output
      batchSize: 2000,
      maxBatches: 2000, // Allow up to 4M records (2000 * 2000)
      delayMs: 100,
      delayEvery: 10, // 100ms delay every 10 batches to be nice to server
      skipBuffer: true, // Don't accumulate in memory
      onFeatures: (features) => {
        writeFeaturesToStream(stream, features);
        totalWritten += features.length;
      },
      onProgress: (progress) => {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = totalWritten / elapsed;
        const remaining = progress.total
          ? (progress.total - totalWritten) / rate
          : 0;

        if (progress.batchNum % 50 === 0 || totalWritten >= (progress.total || 0)) {
          console.log(
            `Batch ${progress.batchNum}: ${totalWritten.toLocaleString()} / ` +
              `${progress.total?.toLocaleString() || '?'} ` +
              `(${progress.total ? ((totalWritten / progress.total) * 100).toFixed(1) : '?'}%) - ` +
              `ETA: ${Math.round(remaining / 60)}min`
          );
        }
      },
      retry: {
        maxRetries: 5,
        baseDelayMs: 2000,
        maxDelayMs: 60000,
      },
    }
  );

  // Close the stream
  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Update cache metadata (features are streamed to disk, not cached in SQLite)
  cache.updateSourceMetadata(SOURCE.id, {
    recordCount: totalWritten,
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nWrote ${totalWritten.toLocaleString()} parcels to ${outputPath}`);
  console.log(`Done in ${Math.round(elapsed / 60)} minutes`);
}

main().catch(console.error);
