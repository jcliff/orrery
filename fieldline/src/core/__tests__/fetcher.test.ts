/**
 * Unit tests for the parallel data fetcher.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parallelFetch,
  createArcGISFetcher,
  createSocrataFetcher,
  type ArcGISConfig,
  type SocrataConfig,
  type FetchProgress,
} from '../fetcher.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Helper functions
// ============================================================================

function mockJsonResponse<T>(data: T): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function mockErrorResponse(status: number, message: string): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(message),
  } as Response;
}

// ============================================================================
// ArcGIS Adapter Tests
// ============================================================================

describe('ArcGIS Adapter', () => {
  it('builds correct count URL', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 100 }));
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(100).fill({ type: 'Feature', properties: {} }),
      })
    );

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1', 'field2'],
      '1=1'
    );

    await parallelFetch(config, { batchSize: 1000, maxBatches: 1 });

    // First call should be count query
    const countUrl = mockFetch.mock.calls[0][0] as string;
    expect(countUrl).toContain('returnCountOnly=true');
    expect(countUrl).toContain('where=1%3D1');
    expect(countUrl).toContain('f=json');
  });

  it('builds correct query URL with all parameters', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 50 }));
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(50).fill({ type: 'Feature', properties: {} }),
      })
    );

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['APN', 'YearBuilt'],
      "YearBuilt > 1900"
    );

    await parallelFetch(config, { batchSize: 1000, maxBatches: 1 });

    // Second call should be data query
    const dataUrl = mockFetch.mock.calls[1][0] as string;
    expect(dataUrl).toContain('outFields=APN%2CYearBuilt');
    expect(dataUrl).toContain('returnGeometry=true');
    expect(dataUrl).toContain('outSR=4326');
    expect(dataUrl).toContain('f=geojson');
    expect(dataUrl).toContain('resultOffset=0');
    expect(dataUrl).toContain('resultRecordCount=1000');
  });

  it('handles custom spatial reference', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(10).fill({ type: 'Feature', properties: {} }),
      })
    );

    const config: ArcGISConfig = {
      type: 'arcgis',
      url: 'https://example.com/arcgis/query',
      outFields: ['field1'],
      outSR: '3857',
    };

    await parallelFetch(config, { batchSize: 1000, maxBatches: 1 });

    const dataUrl = mockFetch.mock.calls[1][0] as string;
    expect(dataUrl).toContain('outSR=3857');
  });

  it('handles exceededTransferLimit flag in sequential mode', async () => {
    // Mock count to return null (sequential mode)
    mockFetch.mockResolvedValueOnce(mockJsonResponse({})); // No count

    // First batch returns data with exceededTransferLimit
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(100).fill({ type: 'Feature', properties: {} }),
        exceededTransferLimit: true,
      })
    );

    // Second batch returns less data (end of data)
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(50).fill({ type: 'Feature', properties: {} }),
        exceededTransferLimit: false,
      })
    );

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    const result = await parallelFetch(config, {
      batchSize: 100,
      maxBatches: 10,
      concurrency: 1,
    });

    expect(result.totalFetched).toBe(150);
    expect(mockFetch).toHaveBeenCalledTimes(3); // count + 2 data batches
  });
});

// ============================================================================
// Socrata Adapter Tests
// ============================================================================

describe('Socrata Adapter', () => {
  it('builds correct URL with pagination', async () => {
    // Socrata doesn't have count endpoint, uses sequential mode
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(Array(100).fill({ id: 1 }))
    );
    mockFetch.mockResolvedValueOnce(mockJsonResponse([])); // Empty = end of data

    const config = createSocrataFetcher(
      'https://data.example.com/resource/abc.json',
      ['id', 'name', 'value']
    );

    await parallelFetch(config, { batchSize: 100, maxBatches: 10 });

    const firstUrl = mockFetch.mock.calls[0][0] as string;
    // URL encoding may use %24 for $ or leave it unencoded
    expect(firstUrl).toMatch(/(\$|%24)select=id%2Cname%2Cvalue/);
    expect(firstUrl).toMatch(/(\$|%24)limit=100/);
    expect(firstUrl).toMatch(/(\$|%24)offset=0/);
  });

  it('includes where clause when specified', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]));

    const config = createSocrataFetcher(
      'https://data.example.com/resource/abc.json',
      ['id'],
      "year > 2020"
    );

    await parallelFetch(config, { batchSize: 100, maxBatches: 1 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/(\$|%24)where=year\+%3E\+2020/);
  });

  it('continues fetching until empty batch', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(Array(100).fill({ id: 1 }))
    );
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(Array(100).fill({ id: 2 }))
    );
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(Array(50).fill({ id: 3 })) // Less than batch size
    );

    const config = createSocrataFetcher(
      'https://data.example.com/resource/abc.json',
      ['id']
    );

    const result = await parallelFetch(config, { batchSize: 100, maxBatches: 10 });

    expect(result.totalFetched).toBe(250);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// ============================================================================
// Retry Logic Tests
// ============================================================================

describe('Retry Logic', () => {
  it('retries on network failure', async () => {
    // Count succeeds
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));

    // First attempt fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    // Second attempt succeeds
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(10).fill({ type: 'Feature', properties: {} }),
      })
    );

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    const result = await parallelFetch(config, {
      batchSize: 1000,
      maxBatches: 1,
      retry: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 },
    });

    expect(result.totalFetched).toBe(10);
    expect(mockFetch).toHaveBeenCalledTimes(3); // count + 1 fail + 1 success
  });

  it('retries on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));
    mockFetch.mockResolvedValueOnce(mockErrorResponse(503, 'Service Unavailable'));
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(10).fill({ type: 'Feature', properties: {} }),
      })
    );

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    const result = await parallelFetch(config, {
      batchSize: 1000,
      maxBatches: 1,
      retry: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 },
    });

    expect(result.totalFetched).toBe(10);
  });

  it('fails after max retries exceeded', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));
    mockFetch.mockRejectedValue(new Error('Persistent failure'));

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    await expect(
      parallelFetch(config, {
        batchSize: 1000,
        maxBatches: 1,
        retry: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 },
      })
    ).rejects.toThrow('Persistent failure');

    // count + 3 data attempts (1 + 2 retries)
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

// ============================================================================
// Concurrency Tests
// ============================================================================

describe('Concurrency', () => {
  it('respects concurrency limit in parallel mode', async () => {
    const totalRecords = 500;
    const batchSize = 100;

    // Return count for parallel mode
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: totalRecords }));

    // Track concurrent requests
    let currentConcurrent = 0;
    let maxConcurrent = 0;

    // Mock data batches with tracking
    for (let i = 0; i < 5; i++) {
      mockFetch.mockImplementationOnce(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 10));
        currentConcurrent--;
        return mockJsonResponse({
          type: 'FeatureCollection',
          features: Array(batchSize).fill({ type: 'Feature', properties: {} }),
        });
      });
    }

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    await parallelFetch(config, {
      concurrency: 2,
      batchSize,
      maxBatches: 10,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('uses sequential mode when total count unknown', async () => {
    // Return no count (forces sequential)
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(100).fill({ type: 'Feature', properties: {} }),
        exceededTransferLimit: true,
      })
    );

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(50).fill({ type: 'Feature', properties: {} }),
      })
    );

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    const result = await parallelFetch(config, {
      concurrency: 4, // Should be ignored in sequential mode
      batchSize: 100,
      maxBatches: 10,
    });

    expect(result.totalFetched).toBe(150);
  });
});

// ============================================================================
// Progress Callback Tests
// ============================================================================

describe('Progress Callbacks', () => {
  it('calls onProgress for each batch', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 200 }));
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(100).fill({ type: 'Feature', properties: {} }),
      })
    );
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(100).fill({ type: 'Feature', properties: {} }),
      })
    );

    const progressUpdates: FetchProgress[] = [];

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    await parallelFetch(config, {
      batchSize: 100,
      maxBatches: 10,
      onProgress: (progress) => progressUpdates.push({ ...progress }),
    });

    expect(progressUpdates.length).toBe(2);
    expect(progressUpdates[0].batchNum).toBeGreaterThanOrEqual(0);
    expect(progressUpdates[0].total).toBe(200);
    expect(progressUpdates[0].message).toContain('features');
  });

  it('provides accurate fetched count in progress', async () => {
    // Use sequential mode for predictable ordering
    mockFetch.mockResolvedValueOnce(mockJsonResponse({})); // No count

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(100).fill({ type: 'Feature', properties: {} }),
        exceededTransferLimit: true,
      })
    );

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        type: 'FeatureCollection',
        features: Array(50).fill({ type: 'Feature', properties: {} }),
      })
    );

    const progressUpdates: FetchProgress[] = [];

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    await parallelFetch(config, {
      batchSize: 100,
      maxBatches: 10,
      concurrency: 1,
      onProgress: (progress) => progressUpdates.push({ ...progress }),
    });

    expect(progressUpdates[0].fetched).toBe(100);
    expect(progressUpdates[1].fetched).toBe(150);
  });
});

// ============================================================================
// Max Batches Tests
// ============================================================================

describe('Max Batches Limit', () => {
  it('stops at maxBatches in parallel mode', async () => {
    const totalRecords = 10000;
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: totalRecords }));

    // Only need to mock 2 batches due to maxBatches: 2
    for (let i = 0; i < 2; i++) {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          type: 'FeatureCollection',
          features: Array(100).fill({ type: 'Feature', properties: {} }),
        })
      );
    }

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    const result = await parallelFetch(config, {
      batchSize: 100,
      maxBatches: 2,
    });

    expect(result.totalFetched).toBe(200);
  });

  it('stops at maxBatches in sequential mode', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({})); // No count

    // Each batch claims there's more
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          type: 'FeatureCollection',
          features: Array(100).fill({ type: 'Feature', properties: {} }),
          exceededTransferLimit: true,
        })
      );
    }

    const config = createArcGISFetcher(
      'https://example.com/arcgis/query',
      ['field1']
    );

    const result = await parallelFetch(config, {
      batchSize: 100,
      maxBatches: 3,
      concurrency: 1,
    });

    expect(result.totalFetched).toBe(300);
    // count + 3 batches (no 4th batch despite exceededTransferLimit)
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

// ============================================================================
// Generic Adapter Tests
// ============================================================================

describe('Generic Adapter', () => {
  it('uses custom buildUrl function', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ records: [{ id: 1 }, { id: 2 }], hasMore: false })
    );

    const result = await parallelFetch(
      {
        type: 'generic',
        buildUrl: (offset, batchSize) =>
          `https://api.example.com/data?skip=${offset}&take=${batchSize}`,
        extractFeatures: (response) =>
          (response as { records: unknown[] }).records,
        hasMore: (response, _features, _offset) => (response as { hasMore: boolean }).hasMore,
      },
      { batchSize: 100, maxBatches: 1 }
    );

    expect(result.totalFetched).toBe(2);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('https://api.example.com/data?skip=0&take=100');
  });

  it('uses custom getCount for parallel mode', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [{ id: 1 }, { id: 2 }] })
    );

    await parallelFetch(
      {
        type: 'generic',
        buildUrl: (offset, batchSize) =>
          `https://api.example.com/data?skip=${offset}&take=${batchSize}`,
        extractFeatures: (response) => (response as { data: unknown[] }).data,
        hasMore: (_response, _features, _offset) => false,
        getCount: async () => 2,
      },
      { batchSize: 100, maxBatches: 10 }
    );

    // With known count, should use parallel mode
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
