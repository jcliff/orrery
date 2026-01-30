/**
 * Integration tests for fetch pipelines.
 * Tests full pipeline flow with mocked HTTP responses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, stat } from 'node:fs/promises';
import { parallelFetch, createArcGISFetcher, createSocrataFetcher } from '../../core/fetcher.js';
import { FeatureCache } from '../../core/cache.js';
import { getSource, SOURCES } from '../../registry/sources.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TEST_DIR = new URL('../../../data/test-output', import.meta.url).pathname;
const TEST_DB_PATH = `${TEST_DIR}/test-cache.db`;

// ============================================================================
// Test Fixtures
// ============================================================================

function mockArcGISCountResponse(count: number) {
  return {
    ok: true,
    json: () => Promise.resolve({ count }),
    text: () => Promise.resolve(JSON.stringify({ count })),
  } as Response;
}

function mockArcGISFeatureResponse(features: object[], exceededLimit = false) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        type: 'FeatureCollection',
        features,
        exceededTransferLimit: exceededLimit,
      }),
    text: () =>
      Promise.resolve(
        JSON.stringify({
          type: 'FeatureCollection',
          features,
          exceededTransferLimit: exceededLimit,
        })
      ),
  } as Response;
}

function mockSocrataResponse(records: object[]) {
  return {
    ok: true,
    json: () => Promise.resolve(records),
    text: () => Promise.resolve(JSON.stringify(records)),
  } as Response;
}

function createMockFeature(id: number, yearBuilt = 2000) {
  return {
    type: 'Feature',
    properties: {
      APN: `APN-${id}`,
      YearBuilt: yearBuilt,
      UseDescription: 'Single Family',
    },
    geometry: {
      type: 'Point',
      coordinates: [-122.4 + id * 0.001, 37.7 + id * 0.001],
    },
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Pipeline Integration', () => {
  let cache: FeatureCache;

  beforeEach(async () => {
    mockFetch.mockReset();
    await mkdir(TEST_DIR, { recursive: true });
    cache = new FeatureCache(TEST_DB_PATH);
  });

  afterEach(async () => {
    cache.close();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('ArcGIS Pipeline', () => {
    it('fetches and caches features from ArcGIS endpoint', async () => {
      // Mock responses
      mockFetch.mockResolvedValueOnce(mockArcGISCountResponse(50));
      mockFetch.mockResolvedValueOnce(
        mockArcGISFeatureResponse(
          Array.from({ length: 50 }, (_, i) => createMockFeature(i))
        )
      );

      const config = createArcGISFetcher(
        'https://example.com/arcgis/query',
        ['APN', 'YearBuilt', 'UseDescription']
      );

      const result = await parallelFetch<GeoJSON.Feature>(config, {
        batchSize: 1000,
        maxBatches: 10,
      });

      expect(result.totalFetched).toBe(50);
      expect(result.features.length).toBe(50);

      // Cache the results
      cache.upsertFeatures('test-source', result.features, (f) =>
        f.properties?.APN as string
      );
      cache.updateSourceMetadata('test-source', { recordCount: 50 });

      // Verify cache
      const cached = cache.getFeatures<GeoJSON.Feature>('test-source');
      expect(cached.length).toBe(50);

      const meta = cache.getSourceMetadata('test-source');
      expect(meta?.recordCount).toBe(50);
    });

    it('uses cached data when not stale', async () => {
      // First, populate cache
      const features = Array.from({ length: 10 }, (_, i) => createMockFeature(i));
      cache.upsertFeatures('cached-source', features, (f) =>
        f.properties?.APN as string
      );
      cache.updateSourceMetadata('cached-source', { recordCount: 10 });

      // Check cache freshness
      expect(cache.needsRefresh('cached-source', 24)).toBe(false);

      // Should be able to get from cache without fetching
      const cached = cache.getFeatures<GeoJSON.Feature>('cached-source');
      expect(cached.length).toBe(10);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles pagination correctly', async () => {
      const totalRecords = 250;
      const batchSize = 100;

      mockFetch.mockResolvedValueOnce(mockArcGISCountResponse(totalRecords));

      // Mock 3 batches - parallel mode will request all at once based on count
      for (let i = 0; i < 3; i++) {
        const count = i === 2 ? 50 : 100; // Last batch is partial
        mockFetch.mockResolvedValueOnce(
          mockArcGISFeatureResponse(
            Array.from({ length: count }, (_, j) =>
              createMockFeature(i * 100 + j)
            )
          )
        );
      }

      const config = createArcGISFetcher(
        'https://example.com/arcgis/query',
        ['APN']
      );

      const result = await parallelFetch<GeoJSON.Feature>(config, {
        batchSize,
        maxBatches: 10,
        concurrency: 4, // Parallel mode with known count
      });

      expect(result.totalFetched).toBe(250);
    });
  });

  describe('Socrata Pipeline', () => {
    it('fetches and transforms Socrata records', async () => {
      const records = Array.from({ length: 25 }, (_, i) => ({
        bbl: `1-${i}-${i}`,
        yearbuilt: 1990 + i,
        landuse: '01',
        address: `${i} Main St`,
        latitude: 40.7 + i * 0.001,
        longitude: -74.0 - i * 0.001,
      }));

      mockFetch.mockResolvedValueOnce(mockSocrataResponse(records));
      mockFetch.mockResolvedValueOnce(mockSocrataResponse([])); // Empty = end

      const config = createSocrataFetcher(
        'https://data.example.com/resource/abc.json',
        ['bbl', 'yearbuilt', 'landuse', 'address', 'latitude', 'longitude']
      );

      const result = await parallelFetch(config, {
        batchSize: 50,
        maxBatches: 10,
      });

      expect(result.totalFetched).toBe(25);
      expect(result.features[0]).toHaveProperty('bbl');
    });
  });

  describe('Streaming Output', () => {
    it('streams features without buffering', async () => {
      // No count response - forces sequential mode which works well with streaming
      mockFetch.mockResolvedValueOnce(mockArcGISCountResponse(0)); // count returns 0 or unavailable

      // Two batches with exceededTransferLimit for sequential mode
      mockFetch.mockResolvedValueOnce(
        mockArcGISFeatureResponse(
          Array.from({ length: 50 }, (_, i) => createMockFeature(i)),
          true // exceededTransferLimit
        )
      );
      mockFetch.mockResolvedValueOnce(
        mockArcGISFeatureResponse(
          Array.from({ length: 50 }, (_, i) => createMockFeature(50 + i)),
          false // no more data
        )
      );

      const streamed: GeoJSON.Feature[] = [];

      const config = createArcGISFetcher(
        'https://example.com/arcgis/query',
        ['APN']
      );

      const result = await parallelFetch<GeoJSON.Feature>(config, {
        batchSize: 50,
        maxBatches: 10,
        concurrency: 1, // Sequential for streaming
        skipBuffer: true,
        onFeatures: (features) => {
          streamed.push(...features);
        },
      });

      // With skipBuffer, result.features should be empty
      expect(result.features.length).toBe(0);
      // But we should have streamed all features
      expect(streamed.length).toBe(100);
      expect(result.totalFetched).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('retries on transient failure', async () => {
      mockFetch.mockResolvedValueOnce(mockArcGISCountResponse(10));

      // First attempt fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Retry succeeds
      mockFetch.mockResolvedValueOnce(
        mockArcGISFeatureResponse(
          Array.from({ length: 10 }, (_, i) => createMockFeature(i))
        )
      );

      const config = createArcGISFetcher(
        'https://example.com/arcgis/query',
        ['APN']
      );

      const result = await parallelFetch<GeoJSON.Feature>(config, {
        batchSize: 1000,
        maxBatches: 1,
        retry: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 },
      });

      expect(result.totalFetched).toBe(10);
    });
  });
});

// ============================================================================
// Source Registry Tests
// ============================================================================

describe('Source Registry', () => {
  it('has required sources defined', () => {
    const requiredSources = [
      'sf-urban',
      'campbell',
      'palo-alto',
      'solano',
      'livermore',
      'la-county',
      'nyc-pluto',
      'clark-county',
      'toronto',
    ];

    for (const id of requiredSources) {
      expect(SOURCES[id]).toBeDefined();
      expect(SOURCES[id].api).toBeDefined();
      expect(SOURCES[id].schema).toBeDefined();
    }
  });

  it('getSource throws for unknown source', () => {
    expect(() => getSource('unknown-source')).toThrow('Unknown source');
  });

  it('source definitions have required fields', () => {
    for (const source of Object.values(SOURCES)) {
      expect(source.id).toBeTruthy();
      expect(source.name).toBeTruthy();
      expect(source.country).toBeTruthy();
      expect(source.attribution).toBeTruthy();
      expect(source.api.type).toMatch(/^(arcgis|socrata|generic)$/);
    }
  });

  it('ArcGIS sources have valid API config', () => {
    const arcgisSources = Object.values(SOURCES).filter(
      (s) => s.api.type === 'arcgis'
    );

    for (const source of arcgisSources) {
      const api = source.api as { url: string; outFields: string[] };
      expect(api.url).toContain('/query');
      expect(api.outFields.length).toBeGreaterThan(0);
    }
  });

  it('Socrata sources have valid API config', () => {
    const socrataSources = Object.values(SOURCES).filter(
      (s) => s.api.type === 'socrata'
    );

    for (const source of socrataSources) {
      const api = source.api as { url: string; fields: string[] };
      // Socrata URLs typically have .json but some APIs may not
      expect(api.url).toMatch(/^https?:\/\//);
      expect(api.fields.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

describe('Rate Limiting', () => {
  it('applies delay between batches', async () => {
    // Use sequential mode (no count) for predictable delay application
    mockFetch.mockResolvedValueOnce(mockArcGISCountResponse(0));

    // 3 batches with sequential mode
    mockFetch.mockResolvedValueOnce(
      mockArcGISFeatureResponse(
        Array.from({ length: 10 }, (_, j) => createMockFeature(j)),
        true // exceededTransferLimit
      )
    );
    mockFetch.mockResolvedValueOnce(
      mockArcGISFeatureResponse(
        Array.from({ length: 10 }, (_, j) => createMockFeature(10 + j)),
        true
      )
    );
    mockFetch.mockResolvedValueOnce(
      mockArcGISFeatureResponse(
        Array.from({ length: 10 }, (_, j) => createMockFeature(20 + j)),
        false // end
      )
    );

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['APN']
    );

    const startTime = Date.now();

    await parallelFetch<GeoJSON.Feature>(config, {
      batchSize: 10,
      maxBatches: 10,
      concurrency: 1,
      delayMs: 30,
      delayEvery: 1,
    });

    const elapsed = Date.now() - startTime;
    // Should have at least 60ms of delay (2 delays between 3 batches, 30ms each)
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});
