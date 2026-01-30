/**
 * Parallel data fetcher with adapter pattern for different API types.
 * Supports ArcGIS REST, Socrata, and generic pagination.
 */
import pLimit from 'p-limit';

// ============================================================================
// Types
// ============================================================================

export interface FetchProgress {
  fetched: number;
  total: number | null;
  batchNum: number;
  message: string;
}

export interface FetchResult<T> {
  features: T[];
  totalFetched: number;
  fromCache: boolean;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface FetcherOptions<T = unknown> {
  concurrency?: number;
  batchSize?: number;
  maxBatches?: number;
  retry?: Partial<RetryOptions>;
  onProgress?: (progress: FetchProgress) => void;
  /** Streaming callback - called with each batch of features */
  onFeatures?: (features: T[]) => void | Promise<void>;
  /** If true, don't accumulate features in memory (for large datasets) */
  skipBuffer?: boolean;
  /** Delay in ms between batches (for rate limiting) */
  delayMs?: number;
  /** Apply delay every N batches (default: 1 = every batch) */
  delayEvery?: number;
}

// ============================================================================
// Retry Logic
// ============================================================================

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(
  url: string,
  options: RetryOptions = DEFAULT_RETRY
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return res.json();
    } catch (err) {
      lastError = err as Error;

      if (attempt < options.maxRetries) {
        const delay = Math.min(
          options.baseDelayMs * Math.pow(2, attempt),
          options.maxDelayMs
        );
        console.warn(
          `Fetch failed (attempt ${attempt + 1}/${options.maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ============================================================================
// ArcGIS Adapter
// ============================================================================

export interface ArcGISConfig {
  type: 'arcgis';
  url: string;
  outFields: string[];
  where?: string;
  outSR?: string;
}

interface ArcGISResponse {
  type: 'FeatureCollection';
  features: unknown[];
  exceededTransferLimit?: boolean;
}

interface ArcGISCountResponse {
  count: number;
}

async function arcgisGetCount(
  config: ArcGISConfig,
  retry: RetryOptions
): Promise<number | null> {
  const params = new URLSearchParams({
    where: config.where || '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });

  try {
    const data = await fetchWithRetry<ArcGISCountResponse>(
      `${config.url}?${params}`,
      retry
    );
    return data.count || null;
  } catch {
    // Some servers don't support count endpoint
    return null;
  }
}

async function arcgisFetchBatch(
  config: ArcGISConfig,
  offset: number,
  batchSize: number,
  retry: RetryOptions
): Promise<ArcGISResponse> {
  const params = new URLSearchParams({
    where: config.where || '1=1',
    outFields: config.outFields.join(','),
    returnGeometry: 'true',
    outSR: config.outSR || '4326',
    f: 'geojson',
    resultOffset: offset.toString(),
    resultRecordCount: batchSize.toString(),
  });

  return fetchWithRetry<ArcGISResponse>(`${config.url}?${params}`, retry);
}

// ============================================================================
// Socrata Adapter
// ============================================================================

export interface SocrataConfig {
  type: 'socrata';
  url: string;
  fields: string[];
  where?: string;
}

async function socrataFetchBatch(
  config: SocrataConfig,
  offset: number,
  batchSize: number,
  retry: RetryOptions
): Promise<unknown[]> {
  const params = new URLSearchParams({
    $select: config.fields.join(','),
    $limit: batchSize.toString(),
    $offset: offset.toString(),
  });

  if (config.where) {
    params.set('$where', config.where);
  }

  return fetchWithRetry<unknown[]>(`${config.url}?${params}`, retry);
}

// ============================================================================
// Generic Adapter (for custom APIs)
// ============================================================================

export interface GenericConfig {
  type: 'generic';
  /** Function to build URL for a given offset */
  buildUrl: (offset: number, batchSize: number) => string;
  /** Extract features array from response */
  extractFeatures: (response: unknown) => unknown[];
  /** Check if there are more results */
  hasMore: (response: unknown, features: unknown[], offset: number) => boolean;
  /** Optional: get total count */
  getCount?: () => Promise<number | null>;
}

// ============================================================================
// Unified Fetcher
// ============================================================================

export type AdapterConfig = ArcGISConfig | SocrataConfig | GenericConfig;

export async function parallelFetch<T = unknown>(
  config: AdapterConfig,
  options: FetcherOptions<T> = {}
): Promise<FetchResult<T>> {
  const {
    concurrency = 4,
    batchSize = 2000,
    maxBatches = 100,
    retry = {},
    onProgress,
    onFeatures,
    skipBuffer = false,
    delayMs = 0,
    delayEvery = 1,
  } = options;

  const retryOpts = { ...DEFAULT_RETRY, ...retry };
  const limit = pLimit(concurrency);
  const allFeatures: T[] = [];
  let totalFetched = 0;

  // Helper to apply rate limiting
  const applyDelay = async (batchNum: number): Promise<void> => {
    if (delayMs > 0 && delayEvery > 0 && batchNum > 0 && batchNum % delayEvery === 0) {
      await sleep(delayMs);
    }
  };

  // Helper to handle features (buffer or stream)
  const handleFeatures = async (features: T[]): Promise<void> => {
    if (onFeatures) {
      await onFeatures(features);
    }
    if (!skipBuffer) {
      allFeatures.push(...features);
    }
    totalFetched += features.length;
  };

  // Get total count if available
  let totalCount: number | null = null;
  if (config.type === 'arcgis') {
    totalCount = await arcgisGetCount(config, retryOpts);
  } else if (config.type === 'generic' && config.getCount) {
    totalCount = await config.getCount();
  }

  if (totalCount !== null) {
    console.log(`Total records: ${totalCount.toLocaleString()}`);
  }

  // For parallel fetching, we need to know total or use sequential fallback
  // When streaming (onFeatures), use sequential to maintain order
  if (totalCount !== null && concurrency > 1 && !onFeatures) {
    // Parallel mode: calculate all batch offsets upfront
    const numBatches = Math.min(
      Math.ceil(totalCount / batchSize),
      maxBatches
    );
    const offsets = Array.from(
      { length: numBatches },
      (_, i) => i * batchSize
    );

    const results = await Promise.all(
      offsets.map((offset, batchNum) =>
        limit(async () => {
          await applyDelay(batchNum);

          let features: T[];

          if (config.type === 'arcgis') {
            const data = await arcgisFetchBatch(
              config,
              offset,
              batchSize,
              retryOpts
            );
            features = (data.features || []) as T[];
          } else if (config.type === 'socrata') {
            features = (await socrataFetchBatch(
              config,
              offset,
              batchSize,
              retryOpts
            )) as T[];
          } else {
            const url = config.buildUrl(offset, batchSize);
            const response = await fetchWithRetry<unknown>(url, retryOpts);
            features = config.extractFeatures(response) as T[];
          }

          onProgress?.({
            fetched: offset + features.length,
            total: totalCount,
            batchNum,
            message: `Batch ${batchNum}: ${features.length} features`,
          });

          return features;
        })
      )
    );

    for (const batch of results) {
      await handleFeatures(batch);
    }
  } else {
    // Sequential mode: stop when no more data
    // Also used when streaming (onFeatures) to maintain order
    let offset = 0;
    let batchNum = 0;

    while (batchNum < maxBatches) {
      await applyDelay(batchNum);

      let features: T[];
      let hasMore = true;

      if (config.type === 'arcgis') {
        const data = await arcgisFetchBatch(
          config,
          offset,
          batchSize,
          retryOpts
        );
        features = (data.features || []) as T[];
        hasMore = data.exceededTransferLimit ?? features.length === batchSize;
      } else if (config.type === 'socrata') {
        features = (await socrataFetchBatch(
          config,
          offset,
          batchSize,
          retryOpts
        )) as T[];
        hasMore = features.length === batchSize;
      } else {
        const url = config.buildUrl(offset, batchSize);
        const response = await fetchWithRetry<unknown>(url, retryOpts);
        features = config.extractFeatures(response) as T[];
        hasMore = config.hasMore(response, features, offset);
      }

      if (features.length === 0) {
        break;
      }

      await handleFeatures(features);

      onProgress?.({
        fetched: totalFetched,
        total: totalCount,
        batchNum,
        message: `Batch ${batchNum}: ${features.length} features (total: ${totalFetched})`,
      });

      if (!hasMore) {
        break;
      }

      offset += features.length;
      batchNum++;
    }
  }

  return {
    features: allFeatures,
    totalFetched,
    fromCache: false,
  };
}

// ============================================================================
// Convenience Helpers
// ============================================================================

export function createArcGISFetcher(
  url: string,
  outFields: string[],
  where = '1=1'
): ArcGISConfig {
  return {
    type: 'arcgis',
    url,
    outFields,
    where,
  };
}

export function createSocrataFetcher(
  url: string,
  fields: string[],
  where?: string
): SocrataConfig {
  return {
    type: 'socrata',
    url,
    fields,
    where,
  };
}

// ============================================================================
// Multi-Endpoint Fetcher (for sources like Clark County with multiple layers)
// ============================================================================

export interface EndpointConfig {
  id: string;
  config: AdapterConfig;
  /** If true, continue fetching other endpoints even if this one fails */
  optional?: boolean;
  /** Additional properties to add to each feature from this endpoint */
  metadata?: Record<string, unknown>;
}

export interface MultiEndpointConfig {
  endpoints: EndpointConfig[];
  /** How to combine results: 'concat' = simple concatenation, 'dedupe' = remove duplicates by ID */
  merge: 'concat' | 'dedupe';
  /** ID property for deduplication (required if merge is 'dedupe') */
  idProperty?: string;
}

export interface MultiEndpointResult<T> {
  features: T[];
  totalFetched: number;
  byEndpoint: Record<string, { fetched: number; error?: string }>;
}

export async function fetchMultiEndpoint<T = unknown>(
  config: MultiEndpointConfig,
  options: FetcherOptions<T> = {}
): Promise<MultiEndpointResult<T>> {
  const allFeatures: T[] = [];
  const byEndpoint: Record<string, { fetched: number; error?: string }> = {};

  for (const endpoint of config.endpoints) {
    console.log(`\n=== Fetching ${endpoint.id} ===`);

    try {
      const result = await parallelFetch<T>(endpoint.config, {
        ...options,
        onFeatures: async (features) => {
          // Add endpoint metadata to each feature
          if (endpoint.metadata) {
            for (const feature of features) {
              if (typeof feature === 'object' && feature !== null) {
                const f = feature as { properties?: Record<string, unknown> };
                if (f.properties) {
                  Object.assign(f.properties, endpoint.metadata);
                }
              }
            }
          }

          // Forward to original onFeatures callback
          if (options.onFeatures) {
            await options.onFeatures(features);
          }
        },
        // Don't skip buffer here - we need to accumulate for deduplication
        skipBuffer: false,
      });

      allFeatures.push(...result.features);
      byEndpoint[endpoint.id] = { fetched: result.totalFetched };
      console.log(`  ${endpoint.id}: ${result.totalFetched} features`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      byEndpoint[endpoint.id] = { fetched: 0, error: errorMessage };

      if (endpoint.optional) {
        console.warn(`  ${endpoint.id}: SKIPPED (${errorMessage})`);
      } else {
        throw error;
      }
    }
  }

  // Handle deduplication if requested
  let finalFeatures = allFeatures;
  if (config.merge === 'dedupe' && config.idProperty) {
    const seen = new Set<string>();
    finalFeatures = [];

    for (const feature of allFeatures) {
      const f = feature as { properties?: Record<string, unknown> };
      const id = f.properties?.[config.idProperty];
      if (id !== undefined) {
        const idStr = String(id);
        if (!seen.has(idStr)) {
          seen.add(idStr);
          finalFeatures.push(feature);
        }
      } else {
        // No ID, include anyway
        finalFeatures.push(feature);
      }
    }

    console.log(`\nDeduplication: ${allFeatures.length} -> ${finalFeatures.length} features`);
  }

  return {
    features: finalFeatures,
    totalFetched: finalFeatures.length,
    byEndpoint,
  };
}
