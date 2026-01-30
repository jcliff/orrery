/**
 * NYC PLUTO fetch pipeline.
 * Uses the common parallel fetcher with streaming NDJSON output.
 * Converts lat/lon fields to GeoJSON point geometry.
 */
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { parallelFetch } from '../core/fetcher.js';
import { getCache } from '../core/cache.js';
import { getSource } from '../registry/sources.js';
import type { Feature, Point } from 'geojson';

const OUTPUT_DIR = new URL('../../data/raw/nyc', import.meta.url).pathname;
const SOURCE = getSource('nyc-pluto');

interface PLUTORecord {
  bbl: string;
  yearbuilt: string;
  landuse: string;
  bldgclass: string;
  address: string;
  zipcode: string;
  borough: string;
  block: string;
  lot: string;
  numfloors: string;
  unitsres: string;
  unitstotal: string;
  lotarea: string;
  bldgarea: string;
  assesstot: string;
  latitude: string;
  longitude: string;
}

// Convert PLUTO record with lat/lon to GeoJSON Feature
function toGeoJSONFeature(record: PLUTORecord): Feature<Point> | null {
  const lat = parseFloat(record.latitude);
  const lon = parseFloat(record.longitude);

  // Skip records without valid coordinates
  if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
    return null;
  }

  return {
    type: 'Feature',
    properties: {
      bbl: record.bbl,
      yearbuilt: record.yearbuilt ? parseInt(record.yearbuilt, 10) : null,
      landuse: record.landuse,
      bldgclass: record.bldgclass,
      address: record.address,
      zipcode: record.zipcode,
      borough: record.borough,
      block: record.block,
      lot: record.lot,
      numfloors: record.numfloors ? parseFloat(record.numfloors) : null,
      unitsres: record.unitsres ? parseInt(record.unitsres, 10) : null,
      unitstotal: record.unitstotal ? parseInt(record.unitstotal, 10) : null,
      lotarea: record.lotarea ? parseFloat(record.lotarea) : null,
      bldgarea: record.bldgarea ? parseFloat(record.bldgarea) : null,
      assesstot: record.assesstot ? parseFloat(record.assesstot) : null,
    },
    geometry: {
      type: 'Point',
      coordinates: [lon, lat],
    },
  };
}

// Stream features to file as NDJSON
function writeFeaturesToStream(stream: WriteStream, features: Feature[]): void {
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
  const outputPath = `${OUTPUT_DIR}/pluto.ndjson`;
  const stream = createWriteStream(outputPath);
  let totalWritten = 0;
  let skippedNoCoords = 0;
  const startTime = Date.now();

  // Get API config from source registry
  const api = SOURCE.api as { type: 'socrata'; url: string; fields: string[]; where?: string };

  // Use streaming fetch with NDJSON output
  await parallelFetch<PLUTORecord>(
    {
      type: 'socrata',
      url: api.url,
      fields: api.fields,
      where: api.where,
    },
    {
      concurrency: 1, // Sequential for ordered NDJSON output
      batchSize: 50000, // Socrata allows up to 50k per request
      maxBatches: 100, // Allow up to 5M records
      delayMs: 500,
      delayEvery: 1, // Delay after every batch
      skipBuffer: true,
      onFeatures: (records) => {
        const features: Feature[] = [];
        for (const record of records) {
          const feature = toGeoJSONFeature(record);
          if (feature) {
            features.push(feature);
          } else {
            skippedNoCoords++;
          }
        }
        writeFeaturesToStream(stream, features);
        totalWritten += features.length;
      },
      onProgress: (progress) => {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (totalWritten + skippedNoCoords) / elapsed;
        const remaining = progress.total
          ? (progress.total - totalWritten - skippedNoCoords) / rate
          : 0;

        console.log(
          `Batch ${progress.batchNum}: ${totalWritten.toLocaleString()} features ` +
            `(${skippedNoCoords.toLocaleString()} skipped no coords) - ` +
            `ETA: ${Math.round(remaining / 60)}min`
        );
      },
      retry: {
        maxRetries: 3,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
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

  // Update cache metadata
  cache.updateSourceMetadata(SOURCE.id, {
    recordCount: totalWritten,
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nWrote ${totalWritten.toLocaleString()} tax lots to ${outputPath}`);
  console.log(`Skipped ${skippedNoCoords.toLocaleString()} records without coordinates`);
  console.log(`Done in ${Math.round(elapsed / 60)} minutes`);
}

main().catch(console.error);
