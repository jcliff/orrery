/**
 * Unit tests for the schema normalizer.
 */
import { describe, it, expect } from 'vitest';
import {
  parseYear,
  detectDateFormat,
  categorizeLandUse,
  parseAddress,
  toWGS84,
  detectCRS,
  reprojectGeometry,
  SchemaNormalizer,
  type DateFormat,
  type LandUseCategory,
} from '../schema-normalizer.js';
import type { Feature, Point, Polygon } from 'geojson';

// ============================================================================
// Date Parsing Tests
// ============================================================================

describe('Date Parsing', () => {
  describe('detectDateFormat', () => {
    it('detects ISO format', () => {
      expect(detectDateFormat('2024-01-15')).toBe('iso');
      expect(detectDateFormat('2024-01-15T00:00:00Z')).toBe('iso');
      expect(detectDateFormat('1985-12-31')).toBe('iso');
    });

    it('detects US format', () => {
      expect(detectDateFormat('01/15/2024')).toBe('us');
      expect(detectDateFormat('1/5/2024')).toBe('us');
      expect(detectDateFormat('12/31/1985')).toBe('us');
    });

    it('detects EU format', () => {
      // Note: 15/01/2024 is ambiguous (could be US or EU), but 31/12/1985 is clearly EU
      expect(detectDateFormat('31.12.1985')).toBe('eu');
      // Dates with period separator are EU
      expect(detectDateFormat('15.01.2024')).toBe('eu');
    });

    it('detects year only', () => {
      expect(detectDateFormat('2024')).toBe('year_only');
      expect(detectDateFormat('1985')).toBe('year_only');
    });

    it('returns null for unrecognized formats', () => {
      expect(detectDateFormat('not a date')).toBeNull();
      expect(detectDateFormat('Jan 15, 2024')).toBeNull();
      expect(detectDateFormat('')).toBeNull();
    });
  });

  describe('parseYear', () => {
    it('parses ISO dates', () => {
      expect(parseYear('2024-01-15')).toBe(2024);
      expect(parseYear('1985-12-31T23:59:59Z')).toBe(1985);
    });

    it('parses US dates', () => {
      expect(parseYear('01/15/2024')).toBe(2024);
      expect(parseYear('12/31/1985')).toBe(1985);
    });

    it('parses EU dates', () => {
      expect(parseYear('15/01/2024')).toBe(2024);
      expect(parseYear('31.12.1985')).toBe(1985);
    });

    it('parses year only', () => {
      expect(parseYear('2024')).toBe(2024);
      expect(parseYear('1950')).toBe(1950);
    });

    it('parses numeric year values', () => {
      expect(parseYear(2024)).toBe(2024);
      expect(parseYear(1985)).toBe(1985);
    });

    it('rejects invalid year ranges', () => {
      expect(parseYear(1200)).toBeNull(); // Too old
      expect(parseYear(2200)).toBeNull(); // Too far in future
      expect(parseYear(0)).toBeNull();
    });

    it('handles Unix timestamps', () => {
      // Unix timestamp for 2024-01-01 00:00:00 UTC
      // Note: result depends on timezone, so check it's in reasonable range
      const result = parseYear(1704067200);
      expect(result).toBeGreaterThanOrEqual(2023);
      expect(result).toBeLessThanOrEqual(2024);
    });

    it('returns null for null/undefined', () => {
      expect(parseYear(null)).toBeNull();
      expect(parseYear(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseYear('')).toBeNull();
      expect(parseYear('  ')).toBeNull();
    });

    it('uses hint format when auto-detection fails', () => {
      expect(parseYear('15/01/2024', 'eu')).toBe(2024);
    });
  });
});

// ============================================================================
// Land Use Categorization Tests
// ============================================================================

describe('Land Use Categorization', () => {
  describe('categorizeLandUse', () => {
    it('categorizes single family residential', () => {
      expect(categorizeLandUse('Single Family Residential')).toBe('single_family');
      expect(categorizeLandUse('SFR')).toBe('single_family');
      expect(categorizeLandUse('Detached House')).toBe('single_family');
      expect(categorizeLandUse('1 Family Dwelling')).toBe('single_family');
    });

    it('categorizes multi family residential', () => {
      expect(categorizeLandUse('Multi Family')).toBe('multi_family');
      expect(categorizeLandUse('Apartment')).toBe('multi_family');
      expect(categorizeLandUse('Condominium')).toBe('multi_family');
      expect(categorizeLandUse('Duplex')).toBe('multi_family');
      expect(categorizeLandUse('Triplex')).toBe('multi_family');
      expect(categorizeLandUse('10 Units')).toBe('multi_family');
      expect(categorizeLandUse('Flats')).toBe('multi_family');
    });

    it('categorizes retail', () => {
      expect(categorizeLandUse('Retail Store')).toBe('retail');
      expect(categorizeLandUse('Shopping Center')).toBe('retail');
      expect(categorizeLandUse('Restaurant')).toBe('retail');
      expect(categorizeLandUse('Food Service')).toBe('retail');
    });

    it('categorizes office', () => {
      expect(categorizeLandUse('Office Building')).toBe('office');
      expect(categorizeLandUse('Professional Services')).toBe('office');
      expect(categorizeLandUse('Business Park')).toBe('office');
    });

    it('categorizes industrial', () => {
      expect(categorizeLandUse('Industrial')).toBe('industrial');
      expect(categorizeLandUse('Warehouse')).toBe('industrial');
      expect(categorizeLandUse('Manufacturing')).toBe('industrial');
      expect(categorizeLandUse('Distribution Center')).toBe('industrial');
      expect(categorizeLandUse('Light Industrial')).toBe('industrial');
    });

    it('categorizes hotel', () => {
      expect(categorizeLandUse('Hotel')).toBe('hotel');
      expect(categorizeLandUse('Motel')).toBe('hotel');
      expect(categorizeLandUse('Lodging')).toBe('hotel');
      expect(categorizeLandUse('Inn')).toBe('hotel');
    });

    it('categorizes government', () => {
      expect(categorizeLandUse('Government Building')).toBe('government');
      expect(categorizeLandUse('Public Facility')).toBe('government');
      expect(categorizeLandUse('Municipal')).toBe('government');
      expect(categorizeLandUse('School')).toBe('government');
      expect(categorizeLandUse('Hospital')).toBe('government');
      expect(categorizeLandUse('Fire Station')).toBe('government');
    });

    it('categorizes mixed use', () => {
      expect(categorizeLandUse('Mixed Use')).toBe('mixed_use');
      expect(categorizeLandUse('Live-Work')).toBe('mixed_use');
      expect(categorizeLandUse('Residential/Commercial')).toBe('mixed_use');
    });

    it('categorizes vacant', () => {
      expect(categorizeLandUse('Vacant')).toBe('vacant');
      expect(categorizeLandUse('Undeveloped')).toBe('vacant');
      expect(categorizeLandUse('Bare Land')).toBe('vacant');
    });

    it('returns other for unrecognized types', () => {
      expect(categorizeLandUse('Unknown')).toBe('other');
      expect(categorizeLandUse('Special Purpose')).toBe('other');
      expect(categorizeLandUse('')).toBe('other');
    });

    it('returns other for null', () => {
      expect(categorizeLandUse(null)).toBe('other');
    });

    it('is case insensitive', () => {
      expect(categorizeLandUse('SINGLE FAMILY')).toBe('single_family');
      expect(categorizeLandUse('apartment')).toBe('multi_family');
      expect(categorizeLandUse('RETAIL')).toBe('retail');
    });
  });
});

// ============================================================================
// Address Parsing Tests
// ============================================================================

describe('Address Parsing', () => {
  describe('parseAddress', () => {
    it('parses US/Canadian addresses', () => {
      const result = parseAddress('123 Main Street');
      expect(result.number).toBe('123');
      expect(result.street).toBe('Main Street');
    });

    it('parses addresses with city', () => {
      const result = parseAddress('456 Oak Ave, San Francisco');
      expect(result.number).toBe('456');
      expect(result.street).toBe('Oak Ave');
      expect(result.city).toBe('San Francisco');
    });

    it('parses hyphenated street numbers', () => {
      const result = parseAddress('12-34 Queens Blvd');
      expect(result.number).toBe('12-34');
      expect(result.street).toBe('Queens Blvd');
    });

    it('parses UK flat addresses', () => {
      const result = parseAddress('Flat 1, 42 High Street');
      expect(result.number).toBe('42');
      expect(result.street).toBe('High Street');
    });

    it('parses UK unit addresses', () => {
      const result = parseAddress('Unit 5, 10 Park Road');
      expect(result.number).toBe('10');
      expect(result.street).toBe('Park Road');
    });

    it('handles addresses without street number', () => {
      const result = parseAddress('Central Park');
      expect(result.number).toBeNull();
      expect(result.street).toBe('Central Park');
    });

    it('handles null input', () => {
      const result = parseAddress(null);
      expect(result.number).toBeNull();
      expect(result.street).toBeNull();
      expect(result.full).toBe('');
    });

    it('preserves full address', () => {
      const result = parseAddress('123 Main St, City, ST 12345');
      expect(result.full).toBe('123 Main St, City, ST 12345');
    });
  });
});

// ============================================================================
// Coordinate System Tests
// ============================================================================

describe('Coordinate Systems', () => {
  describe('detectCRS', () => {
    it('detects WGS84 coordinates', () => {
      const result = detectCRS([-122.4194, 37.7749]);
      expect(result.crs).toBe('EPSG:4326');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('detects Web Mercator coordinates', () => {
      const result = detectCRS([-13627665, 4548349]);
      expect(result.crs).toBe('EPSG:3857');
    });

    it('detects British National Grid coordinates', () => {
      const result = detectCRS([530034, 180381]);
      expect(result.crs).toBe('EPSG:27700');
    });

    it('detects California State Plane coordinates', () => {
      const result = detectCRS([1700000, 550000]);
      expect(result.crs).toBe('EPSG:2227');
    });
  });

  describe('toWGS84', () => {
    it('returns same coordinates for WGS84', () => {
      const coords: [number, number] = [-122.4194, 37.7749];
      const result = toWGS84(coords, 'EPSG:4326');
      expect(result).toEqual(coords);
    });

    it('reprojects British National Grid to WGS84', () => {
      // Big Ben approximate BNG coords
      const bng: [number, number] = [530034, 179756];
      const result = toWGS84(bng, 'EPSG:27700');

      // Should be roughly -0.1246, 51.5007
      expect(result[0]).toBeCloseTo(-0.124, 2);
      expect(result[1]).toBeCloseTo(51.50, 1);
    });

    it('reprojects Web Mercator to WGS84', () => {
      // San Francisco in Web Mercator
      const merc: [number, number] = [-13627665, 4548349];
      const result = toWGS84(merc, 'EPSG:3857');

      expect(result[0]).toBeCloseTo(-122.4, 0); // Within 0.5 degrees
      expect(result[1]).toBeCloseTo(37.8, 0); // Within 0.5 degrees
    });

    it('throws for unknown CRS', () => {
      expect(() => toWGS84([0, 0], 'EPSG:99999')).toThrow('Unknown CRS');
    });
  });

  describe('reprojectGeometry', () => {
    it('returns same geometry for WGS84', () => {
      const geom: Point = { type: 'Point', coordinates: [-122.4, 37.7] };
      const result = reprojectGeometry(geom, 'EPSG:4326');
      expect(result).toEqual(geom);
    });

    it('reprojects Point geometry', () => {
      const bngPoint: Point = { type: 'Point', coordinates: [530034, 179756] };
      const result = reprojectGeometry(bngPoint, 'EPSG:27700') as Point;

      expect(result.type).toBe('Point');
      expect(result.coordinates[0]).toBeCloseTo(-0.124, 2);
      expect(result.coordinates[1]).toBeCloseTo(51.50, 1);
    });

    it('reprojects Polygon geometry', () => {
      const bngPolygon: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [530000, 180000],
          [530100, 180000],
          [530100, 180100],
          [530000, 180100],
          [530000, 180000],
        ]],
      };

      const result = reprojectGeometry(bngPolygon, 'EPSG:27700') as Polygon;

      expect(result.type).toBe('Polygon');
      expect(result.coordinates[0].length).toBe(5);
      // First point should be WGS84
      expect(result.coordinates[0][0][0]).toBeCloseTo(-0.124, 1);
      expect(result.coordinates[0][0][1]).toBeCloseTo(51.5, 1);
    });
  });
});

// ============================================================================
// Schema Normalizer Tests
// ============================================================================

describe('SchemaNormalizer', () => {
  it('normalizes a feature with all fields', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: {
        id: 'parcel_id',
        yearBuilt: 'year_built',
        landUse: 'use_code',
        address: 'address',
        area: 'lot_size',
        stories: 'num_floors',
        units: 'unit_count',
      },
      areaUnit: 'sqft',
    });

    const feature: Feature = {
      type: 'Feature',
      properties: {
        parcel_id: 'APN-123',
        year_built: 1985,
        use_code: 'Single Family',
        address: '123 Main St',
        lot_size: 5000,
        num_floors: 2,
        unit_count: 1,
      },
      geometry: { type: 'Point', coordinates: [-122.4, 37.7] },
    };

    const normalized = normalizer.normalize(feature, 0);

    expect(normalized.id).toBe('APN-123');
    expect(normalized.yearBuilt).toBe(1985);
    expect(normalized.landUse).toBe('Single Family');
    expect(normalized.landUseCategory).toBe('single_family');
    expect(normalized.address).toBe('123 Main St');
    expect(normalized.area).toBeCloseTo(464.5, 1); // 5000 sqft in sqm
    expect(normalized.stories).toBe(2);
    expect(normalized.units).toBe(1);
  });

  it('uses custom land use mapping', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: { landUse: 'code' },
      landUseMapping: {
        'R1': 'single_family',
        'C2': 'retail',
        'I1': 'industrial',
      },
    });

    const feature: Feature = {
      type: 'Feature',
      properties: { code: 'R1' },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };

    const normalized = normalizer.normalize(feature, 0);
    expect(normalized.landUseCategory).toBe('single_family');
  });

  it('handles multiple field candidates', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: {
        yearBuilt: ['year_built', 'eff_year', 'yr_blt'],
      },
    });

    // First candidate is null, should use second
    const feature: Feature = {
      type: 'Feature',
      properties: { year_built: null, eff_year: 1990, yr_blt: 1985 },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };

    const normalized = normalizer.normalize(feature, 0);
    expect(normalized.yearBuilt).toBe(1990);
  });

  it('generates ID from index when missing', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: { id: 'missing_field' },
    });

    const feature: Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [0, 0] },
    };

    const normalized = normalizer.normalize(feature, 42);
    expect(normalized.id).toBe('test_42');
  });

  it('converts area units correctly', () => {
    const sqftNormalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: { area: 'size' },
      areaUnit: 'sqft',
    });

    const acresNormalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: { area: 'size' },
      areaUnit: 'acres',
    });

    const feature: Feature = {
      type: 'Feature',
      properties: { size: 1000 },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };

    const sqftResult = sqftNormalizer.normalize(feature, 0);
    const acresResult = acresNormalizer.normalize(feature, 0);

    expect(sqftResult.area).toBeCloseTo(92.9, 1); // 1000 sqft in sqm
    expect(acresResult.area).toBeCloseTo(4046860, -2); // 1000 acres in sqm
  });

  it('reprojects geometry from source CRS', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: {},
      sourceCRS: 'EPSG:27700',
    });

    const feature: Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [530034, 179756] },
    };

    const normalized = normalizer.normalize(feature, 0);
    const coords = (normalized.geometry as Point).coordinates;

    expect(coords[0]).toBeCloseTo(-0.124, 2);
    expect(coords[1]).toBeCloseTo(51.50, 1);
  });

  it('preserves raw properties', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: {},
    });

    const feature: Feature = {
      type: 'Feature',
      properties: { custom_field: 'custom_value', another: 123 },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };

    const normalized = normalizer.normalize(feature, 0);
    expect(normalized.raw.custom_field).toBe('custom_value');
    expect(normalized.raw.another).toBe(123);
  });

  it('normalizes batch of features', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: { id: 'id' },
    });

    const features: Feature[] = [
      { type: 'Feature', properties: { id: 'a' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: { id: 'b' }, geometry: { type: 'Point', coordinates: [1, 1] } },
      { type: 'Feature', properties: { id: 'c' }, geometry: { type: 'Point', coordinates: [2, 2] } },
    ];

    const normalized = normalizer.normalizeBatch(features);
    expect(normalized.length).toBe(3);
    expect(normalized.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles null/undefined property values gracefully', () => {
    const normalizer = new SchemaNormalizer({
      sourceId: 'test',
      fieldMapping: {
        yearBuilt: 'year',
        stories: 'floors',
        units: 'unit_count',
      },
    });

    const feature: Feature = {
      type: 'Feature',
      properties: { year: null, floors: undefined },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };

    const normalized = normalizer.normalize(feature, 0);
    expect(normalized.yearBuilt).toBeNull();
    expect(normalized.stories).toBeNull();
    expect(normalized.units).toBeNull();
  });
});
