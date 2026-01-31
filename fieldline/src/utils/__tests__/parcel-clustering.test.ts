import { describe, it, expect } from 'vitest';
import {
  getBlockId,
  getGridKey,
  getClusterKey,
  getCentroid,
  median,
  findDominant,
  createCluster,
  addToCluster,
  GRID_SIZE,
} from '../parcel-clustering';

describe('parcel-clustering', () => {
  describe('getBlockId', () => {
    it('extracts first two segments from hyphenated APN', () => {
      expect(getBlockId('001-234-567')).toBe('001-234');
      expect(getBlockId('12-34-56-78')).toBe('12-34');
    });

    it('returns first 6 chars for non-hyphenated APN', () => {
      expect(getBlockId('123456789')).toBe('123456');
      expect(getBlockId('ABCDEFGHIJ')).toBe('ABCDEF');
    });

    it('handles numeric APNs', () => {
      expect(getBlockId(123456789)).toBe('123456');
    });

    it('returns unknown for null/undefined', () => {
      expect(getBlockId(null)).toBe('unknown');
      expect(getBlockId(undefined as unknown as null)).toBe('unknown');
    });

    it('handles short APNs', () => {
      expect(getBlockId('123')).toBe('123');
      expect(getBlockId('1-2')).toBe('1-2');
    });
  });

  describe('getGridKey', () => {
    it('snaps coordinates to grid cells', () => {
      const key = getGridKey(-119.8, 39.5);
      expect(key).toMatch(/^-\d+\.\d{5},-?\d+\.\d{5}$/);
    });

    it('groups nearby coordinates into same cell', () => {
      const key1 = getGridKey(-119.80001, 39.50001);
      const key2 = getGridKey(-119.80002, 39.50002);
      expect(key1).toBe(key2);
    });

    it('separates distant coordinates into different cells', () => {
      const key1 = getGridKey(-119.8, 39.5);
      const key2 = getGridKey(-119.9, 39.6);
      expect(key1).not.toBe(key2);
    });

    it('uses custom grid size', () => {
      // Use coordinates that fall on different cells at different grid sizes
      const smallGrid = getGridKey(-119.8123, 39.5456, 0.001);
      const largeGrid = getGridKey(-119.8123, 39.5456, 0.1);
      expect(smallGrid).not.toBe(largeGrid);
    });
  });

  describe('getClusterKey', () => {
    it('combines block ID and grid key', () => {
      const key = getClusterKey('001-234-567', -119.8, 39.5);
      expect(key).toContain('001-234');
      expect(key).toContain(':');
    });

    it('handles null APN', () => {
      const key = getClusterKey(null, -119.8, 39.5);
      expect(key).toContain('unknown:');
    });
  });

  describe('getCentroid', () => {
    it('calculates centroid of a simple polygon', () => {
      const polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]],
      };
      const [lng, lat] = getCentroid(polygon);
      expect(lng).toBeCloseTo(1.6, 1); // Average of 0,4,4,0,0
      expect(lat).toBeCloseTo(1.6, 1);
    });

    it('uses first polygon for MultiPolygon', () => {
      const multiPolygon = {
        type: 'MultiPolygon',
        coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]], [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]]],
      };
      const [lng, lat] = getCentroid(multiPolygon);
      expect(lng).toBeLessThan(5); // Should use first polygon, not second
      expect(lat).toBeLessThan(5);
    });

    it('returns coordinates directly for Point', () => {
      const point = { type: 'Point', coordinates: [-119.8, 39.5] };
      const [lng, lat] = getCentroid(point);
      expect(lng).toBe(-119.8);
      expect(lat).toBe(39.5);
    });

    it('throws for unsupported geometry types', () => {
      const lineString = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
      expect(() => getCentroid(lineString)).toThrow('Unsupported geometry type');
    });
  });

  describe('median', () => {
    it('returns middle value for odd-length arrays', () => {
      expect(median([1, 3, 5])).toBe(3);
      expect(median([1, 2, 3, 4, 5])).toBe(3);
    });

    it('returns average of middle values for even-length arrays', () => {
      expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 = 2.5, rounded to 3
      expect(median([1, 3])).toBe(2);
    });

    it('handles unsorted input', () => {
      expect(median([5, 1, 3])).toBe(3);
      expect(median([4, 1, 3, 2])).toBe(3);
    });

    it('returns 0 for empty array', () => {
      expect(median([])).toBe(0);
    });

    it('returns single value for single-element array', () => {
      expect(median([42])).toBe(42);
    });
  });

  describe('findDominant', () => {
    it('returns the value with highest count', () => {
      expect(findDominant({ a: 5, b: 10, c: 3 }, 'default')).toBe('b');
      expect(findDominant({ x: 1, y: 1, z: 2 }, 'default')).toBe('z');
    });

    it('returns default for empty object', () => {
      expect(findDominant({}, 'fallback')).toBe('fallback');
    });

    it('returns first max on tie', () => {
      const result = findDominant({ a: 5, b: 5 }, 'default');
      expect(['a', 'b']).toContain(result);
    });
  });

  describe('createCluster', () => {
    it('creates cluster with correct initial values', () => {
      const cluster = createCluster('block-123', 1950);
      expect(cluster.blockId).toBe('block-123');
      expect(cluster.earliestYear).toBe(1950);
      expect(cluster.count).toBe(0);
      expect(cluster.lngSum).toBe(0);
      expect(cluster.latSum).toBe(0);
      expect(cluster.totalArea).toBe(0);
      expect(cluster.hasEstimates).toBe(false);
      expect(cluster.useTypes).toEqual({});
    });
  });

  describe('addToCluster', () => {
    it('accumulates values correctly', () => {
      const cluster = createCluster('block-123', 2000);

      addToCluster(cluster, -119.8, 39.5, 'Residential', 1990, 1500, false);
      expect(cluster.count).toBe(1);
      expect(cluster.lngSum).toBe(-119.8);
      expect(cluster.latSum).toBe(39.5);
      expect(cluster.totalArea).toBe(1500);
      expect(cluster.earliestYear).toBe(1990);
      expect(cluster.useTypes['Residential']).toBe(1);

      addToCluster(cluster, -119.9, 39.6, 'Commercial', 1985, 2000, true);
      expect(cluster.count).toBe(2);
      expect(cluster.lngSum).toBeCloseTo(-239.7, 1);
      expect(cluster.totalArea).toBe(3500);
      expect(cluster.earliestYear).toBe(1985);
      expect(cluster.useTypes['Commercial']).toBe(1);
      expect(cluster.hasEstimates).toBe(true);
    });

    it('tracks multiple use types', () => {
      const cluster = createCluster('block', 2000);
      addToCluster(cluster, 0, 0, 'Residential', 2000, 0, false);
      addToCluster(cluster, 0, 0, 'Residential', 2000, 0, false);
      addToCluster(cluster, 0, 0, 'Commercial', 2000, 0, false);

      expect(cluster.useTypes['Residential']).toBe(2);
      expect(cluster.useTypes['Commercial']).toBe(1);
    });
  });

  describe('GRID_SIZE', () => {
    it('is approximately 50m at mid-latitudes', () => {
      // 0.0005 degrees * 111km/degree * cos(39°) ≈ 43m
      expect(GRID_SIZE).toBe(0.0005);
    });
  });
});
