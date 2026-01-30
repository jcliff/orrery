/**
 * Schema normalizer for international parcel data.
 * Handles field mapping, date formats, coordinate systems, and land use categories.
 */
import proj4 from 'proj4';
import type { Geometry, Feature, GeoJsonProperties } from 'geojson';

// ============================================================================
// Standard Schema
// ============================================================================

export interface NormalizedParcel {
  id: string;
  yearBuilt: number | null;
  effectiveYear: number | null;
  landUse: string;
  landUseCategory: LandUseCategory;
  address: string | null;
  city: string | null;
  area: number | null; // square meters
  stories: number | null;
  units: number | null;
  geometry: Geometry;
  raw: Record<string, unknown>;
}

export type LandUseCategory =
  | 'single_family'
  | 'multi_family'
  | 'retail'
  | 'office'
  | 'industrial'
  | 'hotel'
  | 'government'
  | 'mixed_use'
  | 'vacant'
  | 'other';

// ============================================================================
// Field Mapping
// ============================================================================

export interface FieldMapping {
  id?: string | string[];
  yearBuilt?: string | string[];
  effectiveYear?: string | string[];
  landUse?: string | string[];
  address?: string | string[];
  city?: string | string[];
  area?: string | string[];
  stories?: string | string[];
  units?: string | string[];
}

/**
 * Get first non-null value from candidate field names.
 */
function getField(
  props: Record<string, unknown>,
  mapping: string | string[] | undefined
): unknown {
  if (!mapping) return null;

  const fields = Array.isArray(mapping) ? mapping : [mapping];
  for (const field of fields) {
    const value = props[field];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
}

// ============================================================================
// Date Parsing
// ============================================================================

export type DateFormat = 'iso' | 'us' | 'eu' | 'year_only';

const DATE_PATTERNS: Array<{ format: DateFormat; pattern: RegExp }> = [
  // ISO: 2024-01-15 or 2024-01-15T00:00:00
  { format: 'iso', pattern: /^(\d{4})-(\d{2})-(\d{2})/ },
  // US: 01/15/2024 or 1/15/2024
  { format: 'us', pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/ },
  // EU: 15/01/2024 or 15.01.2024
  { format: 'eu', pattern: /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/ },
  // Year only: 2024 or 1985
  { format: 'year_only', pattern: /^(\d{4})$/ },
];

export function detectDateFormat(value: string): DateFormat | null {
  for (const { format, pattern } of DATE_PATTERNS) {
    if (pattern.test(value)) {
      return format;
    }
  }
  return null;
}

export function parseYear(
  value: unknown,
  format: DateFormat = 'iso'
): number | null {
  if (value === null || value === undefined) return null;

  // Handle numeric input
  if (typeof value === 'number') {
    // Could be a year or a timestamp
    if (value > 1400 && value < 2100) {
      return Math.floor(value);
    }
    // Might be a Unix timestamp
    if (value > 1e9) {
      return new Date(value * 1000).getFullYear();
    }
    return null;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Try to detect format if not specified
  const detected = detectDateFormat(str);
  const useFormat = detected || format;

  switch (useFormat) {
    case 'iso': {
      const match = str.match(/^(\d{4})/);
      return match ? parseInt(match[1], 10) : null;
    }
    case 'us':
    case 'eu': {
      const match = str.match(/(\d{4})$/);
      return match ? parseInt(match[1], 10) : null;
    }
    case 'year_only': {
      const year = parseInt(str, 10);
      return year > 1400 && year < 2100 ? year : null;
    }
    default:
      return null;
  }
}

// ============================================================================
// Coordinate System Handling
// ============================================================================

// Common projections with EPSG codes
const COMMON_PROJECTIONS: Record<string, string> = {
  // WGS84
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
  // Web Mercator
  'EPSG:3857':
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
  // British National Grid
  'EPSG:27700':
    '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs',
  // NAD83 California Zone 3
  'EPSG:2227':
    '+proj=lcc +lat_1=38.43333333333333 +lat_2=37.06666666666667 +lat_0=36.5 +lon_0=-120.5 +x_0=2000000 +y_0=500000.0000000002 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs',
  // NAD83 UTM Zone 10N (California)
  'EPSG:26910':
    '+proj=utm +zone=10 +datum=NAD83 +units=m +no_defs',
  // Australian GDA94
  'EPSG:4283': '+proj=longlat +ellps=GRS80 +no_defs',
  // Australian MGA Zone 55
  'EPSG:28355':
    '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs',
  // Canadian NAD83 CSRS
  'EPSG:4617': '+proj=longlat +ellps=GRS80 +no_defs',
  // Ontario MTM Zone 10
  'EPSG:2019':
    '+proj=tmerc +lat_0=0 +lon_0=-79.5 +k=0.9999 +x_0=304800 +y_0=0 +ellps=GRS80 +units=m +no_defs',
};

/**
 * Detect coordinate system from coordinate values.
 */
export function detectCRS(
  coords: [number, number]
): { crs: string; confidence: number } {
  const [x, y] = coords;

  // WGS84 longitude/latitude
  if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
    return { crs: 'EPSG:4326', confidence: 0.9 };
  }

  // Web Mercator (very large values)
  if (Math.abs(x) > 1e6 && Math.abs(y) > 1e6) {
    return { crs: 'EPSG:3857', confidence: 0.7 };
  }

  // British National Grid (UK bounds)
  if (x > 0 && x < 700000 && y > 0 && y < 1300000) {
    return { crs: 'EPSG:27700', confidence: 0.6 };
  }

  // California State Plane
  if (x > 1e6 && x < 3e6 && y > 1e5 && y < 1e6) {
    return { crs: 'EPSG:2227', confidence: 0.5 };
  }

  return { crs: 'EPSG:4326', confidence: 0.3 };
}

/**
 * Register a custom projection.
 */
export function registerProjection(epsg: string, def: string): void {
  COMMON_PROJECTIONS[epsg] = def;
  proj4.defs(epsg, def);
}

/**
 * Reproject coordinates to WGS84.
 */
export function toWGS84(
  coords: [number, number],
  fromCRS: string
): [number, number] {
  if (fromCRS === 'EPSG:4326') return coords;

  const fromDef = COMMON_PROJECTIONS[fromCRS];
  if (!fromDef) {
    throw new Error(`Unknown CRS: ${fromCRS}. Use registerProjection() to add it.`);
  }

  proj4.defs(fromCRS, fromDef);
  const [lng, lat] = proj4(fromCRS, 'EPSG:4326', coords);
  return [lng, lat];
}

/**
 * Reproject a GeoJSON geometry to WGS84.
 */
export function reprojectGeometry(
  geometry: Geometry,
  fromCRS: string
): Geometry {
  if (fromCRS === 'EPSG:4326') return geometry;

  function reprojectCoords(coords: number[] | number[][]): number[] | number[][] {
    if (typeof coords[0] === 'number') {
      return toWGS84(coords as [number, number], fromCRS);
    }
    return (coords as number[][]).map((c) => reprojectCoords(c) as number[]);
  }

  return {
    ...geometry,
    coordinates: reprojectCoords(
      (geometry as { coordinates: number[] | number[][] }).coordinates
    ),
  } as Geometry;
}

// ============================================================================
// Land Use Category Mapping
// ============================================================================

const LAND_USE_PATTERNS: Array<{
  category: LandUseCategory;
  patterns: RegExp[];
}> = [
  {
    category: 'single_family',
    patterns: [
      /single\s*family/i,
      /\bSFR\b/i,
      /\bSFD\b/i,
      /detached/i,
      /^1\s*family/i,
      /residential.*single/i,
    ],
  },
  {
    category: 'multi_family',
    patterns: [
      /multi\s*family/i,
      /\bMFR\b/i,
      /apartment/i,
      /condo/i,
      /duplex/i,
      /triplex/i,
      /\d+\s*units/i,
      /flats?/i,
      /residential.*multi/i,
    ],
  },
  {
    category: 'retail',
    patterns: [
      /retail/i,
      /store/i,
      /shop/i,
      /commercial.*retail/i,
      /shopping/i,
      /restaurant/i,
      /food\s*service/i,
    ],
  },
  {
    category: 'office',
    patterns: [
      /office/i,
      /professional/i,
      /commercial.*office/i,
      /business\s*park/i,
    ],
  },
  {
    category: 'industrial',
    patterns: [
      /industrial/i,
      /warehouse/i,
      /manufacturing/i,
      /factory/i,
      /distribution/i,
      /light\s*industrial/i,
      /heavy\s*industrial/i,
    ],
  },
  {
    category: 'hotel',
    patterns: [/hotel/i, /motel/i, /lodging/i, /hospitality/i, /inn\b/i],
  },
  {
    category: 'government',
    patterns: [
      /government/i,
      /public/i,
      /municipal/i,
      /federal/i,
      /state\s*owned/i,
      /civic/i,
      /school/i,
      /library/i,
      /fire\s*station/i,
      /police/i,
      /hospital/i,
    ],
  },
  {
    category: 'mixed_use',
    patterns: [/mixed\s*use/i, /live.work/i, /residential.*commercial/i],
  },
  {
    category: 'vacant',
    patterns: [/vacant/i, /undeveloped/i, /bare\s*land/i, /empty\s*lot/i],
  },
];

export function categorizeLandUse(landUse: string | null): LandUseCategory {
  if (!landUse) return 'other';

  const normalized = landUse.trim();

  for (const { category, patterns } of LAND_USE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return category;
      }
    }
  }

  return 'other';
}

// ============================================================================
// Address Parsing
// ============================================================================

export interface ParsedAddress {
  number: string | null;
  street: string | null;
  city: string | null;
  full: string;
}

/**
 * Parse a street address into components.
 * Handles US, UK, and Canadian formats.
 */
export function parseAddress(address: string | null): ParsedAddress {
  if (!address) {
    return { number: null, street: null, city: null, full: '' };
  }

  const full = address.trim();

  // US/Canada: "123 Main St" or "123 Main Street, City"
  const usMatch = full.match(/^(\d+[-\d]*)\s+(.+?)(?:,\s*(.+))?$/);
  if (usMatch) {
    return {
      number: usMatch[1],
      street: usMatch[2],
      city: usMatch[3] || null,
      full,
    };
  }

  // UK: "Flat 1, 123 High Street" or "123 High Street"
  const ukMatch = full.match(/^(?:(?:Flat|Unit)\s+\d+,\s+)?(\d+)\s+(.+?)(?:,\s*(.+))?$/i);
  if (ukMatch) {
    return {
      number: ukMatch[1],
      street: ukMatch[2],
      city: ukMatch[3] || null,
      full,
    };
  }

  return { number: null, street: full, city: null, full };
}

// ============================================================================
// Schema Normalizer
// ============================================================================

export interface NormalizerConfig {
  sourceId: string;
  fieldMapping: FieldMapping;
  dateFormat?: DateFormat;
  sourceCRS?: string;
  landUseMapping?: Record<string, LandUseCategory>;
  areaUnit?: 'sqft' | 'sqm' | 'acres' | 'hectares';
}

const AREA_CONVERSIONS: Record<string, number> = {
  sqft: 0.092903, // to sqm
  sqm: 1,
  acres: 4046.86,
  hectares: 10000,
};

export class SchemaNormalizer {
  private config: NormalizerConfig;

  constructor(config: NormalizerConfig) {
    this.config = config;

    // Register custom CRS if provided
    if (config.sourceCRS && !COMMON_PROJECTIONS[config.sourceCRS]) {
      console.warn(
        `Unknown CRS ${config.sourceCRS}. Use registerProjection() to add it.`
      );
    }
  }

  /**
   * Normalize a GeoJSON feature to standard schema.
   */
  normalize(
    feature: Feature<Geometry, GeoJsonProperties>,
    index: number
  ): NormalizedParcel {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const mapping = this.config.fieldMapping;

    // Get ID
    const idValue = getField(props, mapping.id);
    const id = idValue ? String(idValue) : `${this.config.sourceId}_${index}`;

    // Parse year built
    const yearBuiltRaw = getField(props, mapping.yearBuilt);
    const yearBuilt = parseYear(yearBuiltRaw, this.config.dateFormat);

    // Parse effective year
    const effectiveYearRaw = getField(props, mapping.effectiveYear);
    const effectiveYear = parseYear(effectiveYearRaw, this.config.dateFormat);

    // Get land use
    const landUseRaw = getField(props, mapping.landUse);
    const landUse = landUseRaw ? String(landUseRaw) : '';

    // Categorize land use
    let landUseCategory: LandUseCategory;
    if (this.config.landUseMapping && landUse in this.config.landUseMapping) {
      landUseCategory = this.config.landUseMapping[landUse];
    } else {
      landUseCategory = categorizeLandUse(landUse);
    }

    // Parse address
    const addressRaw = getField(props, mapping.address);
    const address = addressRaw ? String(addressRaw) : null;

    // Get city
    const cityRaw = getField(props, mapping.city);
    const city = cityRaw ? String(cityRaw) : null;

    // Parse area
    const areaRaw = getField(props, mapping.area);
    let area: number | null = null;
    if (areaRaw !== null) {
      const areaNum = parseFloat(String(areaRaw));
      if (!isNaN(areaNum)) {
        const conversionFactor =
          AREA_CONVERSIONS[this.config.areaUnit || 'sqft'];
        area = areaNum * conversionFactor;
      }
    }

    // Parse stories
    const storiesRaw = getField(props, mapping.stories);
    const stories = storiesRaw ? parseFloat(String(storiesRaw)) : null;

    // Parse units
    const unitsRaw = getField(props, mapping.units);
    const units = unitsRaw ? parseInt(String(unitsRaw), 10) : null;

    // Reproject geometry if needed
    let geometry = feature.geometry;
    if (this.config.sourceCRS && this.config.sourceCRS !== 'EPSG:4326') {
      geometry = reprojectGeometry(geometry, this.config.sourceCRS);
    }

    return {
      id,
      yearBuilt,
      effectiveYear,
      landUse,
      landUseCategory,
      address,
      city,
      area,
      stories: stories !== null && !isNaN(stories) ? stories : null,
      units: units !== null && !isNaN(units) ? units : null,
      geometry,
      raw: props,
    };
  }

  /**
   * Normalize a batch of features.
   */
  normalizeBatch(features: Feature<Geometry, GeoJsonProperties>[]): NormalizedParcel[] {
    return features.map((f, i) => this.normalize(f, i));
  }
}

// ============================================================================
// Pre-configured Normalizers
// ============================================================================

export const SOURCE_CONFIGS: Record<string, NormalizerConfig> = {
  'sf-urban': {
    sourceId: 'sf-urban',
    fieldMapping: {
      id: 'parcel_number',
      yearBuilt: 'year_property_built',
      landUse: 'use_definition',
      address: 'property_location',
      area: 'property_area',
      stories: 'number_of_stories',
      units: 'number_of_units',
    },
    areaUnit: 'sqft',
  },
  campbell: {
    sourceId: 'campbell',
    fieldMapping: {
      id: 'APN',
      yearBuilt: ['YEAR_BUILT', 'EFF_YEAR_BUILT'],
      effectiveYear: 'EFF_YEAR_BUILT',
      landUse: 'UseCodeDescription',
      address: 'SITUSFULL',
      area: 'TTL_SQFT_ALL',
    },
    areaUnit: 'sqft',
  },
  'palo-alto': {
    sourceId: 'palo-alto',
    fieldMapping: {
      id: 'APN',
      yearBuilt: 'YearBuilt',
      landUse: 'UseCode_Description',
      address: 'SitusAddress',
      area: 'LotSize',
    },
    areaUnit: 'sqft',
  },
  solano: {
    sourceId: 'solano',
    fieldMapping: {
      id: 'parcelid',
      yearBuilt: 'yrbuilt',
      landUse: 'use_desc',
      address: ['sitenum', 'siteroad'],
      city: 'sitecity',
      area: 'total_area',
      stories: 'stories',
    },
    areaUnit: 'sqft',
  },
  livermore: {
    sourceId: 'livermore',
    fieldMapping: {
      id: 'APN',
      yearBuilt: ['YrBuilt', 'EffYr'],
      effectiveYear: 'EffYr',
      landUse: 'LandUseDescription',
      address: ['SitusNum', 'SitusStreet'],
      city: 'SitusCity',
      area: 'BldgArea',
      stories: 'Stories',
    },
    areaUnit: 'sqft',
  },
};

export function getNormalizer(sourceId: string): SchemaNormalizer {
  const config = SOURCE_CONFIGS[sourceId];
  if (!config) {
    throw new Error(`No normalizer config for source: ${sourceId}`);
  }
  return new SchemaNormalizer(config);
}
