/**
 * Source registry for parcel data providers.
 * Defines API endpoints, field mappings, and normalization settings.
 */
import type { AdapterConfig } from '../core/fetcher.js';
import type { NormalizerConfig } from '../core/schema-normalizer.js';

// ============================================================================
// Types
// ============================================================================

export interface SourceDefinition {
  id: string;
  name: string;
  country: string;
  region: string;
  city?: string;

  /** API configuration for fetching */
  api: AdapterConfig;

  /** Schema normalization config */
  schema: NormalizerConfig;

  /** Expected record count (for progress display) */
  expectedCount?: number;

  /** Update frequency */
  updateFrequency?: 'daily' | 'weekly' | 'monthly' | 'manual';

  /** Source attribution */
  attribution: string;
  attributionUrl: string;

  /** License type */
  license?: string;

  /** Notes about data quality or limitations */
  notes?: string;
}

// ============================================================================
// Bay Area Sources (Existing)
// ============================================================================

export const SF_URBAN: SourceDefinition = {
  id: 'sf-urban',
  name: 'San Francisco Buildings',
  country: 'US',
  region: 'California',
  city: 'San Francisco',
  api: {
    type: 'socrata',
    url: 'https://data.sfgov.org/resource/wv5m-vpq2.json',
    fields: [
      'parcel_number',
      'year_property_built',
      'use_definition',
      'the_geom',
      'analysis_neighborhood',
      'property_location',
      'property_area',
      'number_of_stories',
      'number_of_units',
    ],
    where: "closed_roll_year='2024' AND the_geom IS NOT NULL",
  },
  schema: {
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
  expectedCount: 212000,
  updateFrequency: 'monthly',
  attribution: 'City of San Francisco',
  attributionUrl: 'https://data.sfgov.org',
  license: 'PDDL',
};

export const CAMPBELL: SourceDefinition = {
  id: 'campbell',
  name: 'Campbell Parcels',
  country: 'US',
  region: 'California',
  city: 'Campbell',
  api: {
    type: 'arcgis',
    url: 'https://gis.campbellca.gov/arcgis/rest/services/BaseFeatureLayers/ParcelsPublic/FeatureServer/0/query',
    outFields: [
      'APN',
      'YEAR_BUILT',
      'EFF_YEAR_BUILT',
      'UseCodeDescription',
      'SITUSFULL',
      'TTL_SQFT_ALL',
    ],
  },
  schema: {
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
  expectedCount: 15000,
  updateFrequency: 'monthly',
  attribution: 'City of Campbell',
  attributionUrl: 'https://gis.campbellca.gov',
};

export const PALO_ALTO: SourceDefinition = {
  id: 'palo-alto',
  name: 'Palo Alto Parcels',
  country: 'US',
  region: 'California',
  city: 'Palo Alto',
  api: {
    type: 'arcgis',
    url: 'https://gis.cityofpaloalto.org/server/rest/services/Parcel/ParcelReport/MapServer/16/query',
    outFields: [
      'APN',
      'YEARBUILT',
      'EFFECTIVEYEARBUILT',
      'LANDUSEGIS',
      'ADDRESSNUMBER',
      'STREET',
      'LOTSIZE',
      'ZONEGIS',
    ],
  },
  schema: {
    sourceId: 'palo-alto',
    fieldMapping: {
      id: 'APN',
      yearBuilt: ['YEARBUILT', 'EFFECTIVEYEARBUILT'],
      effectiveYear: 'EFFECTIVEYEARBUILT',
      landUse: 'LANDUSEGIS',
      address: ['ADDRESSNUMBER', 'STREET'],
      area: 'LOTSIZE',
    },
    areaUnit: 'sqft',
  },
  expectedCount: 30000,
  updateFrequency: 'monthly',
  attribution: 'City of Palo Alto',
  attributionUrl: 'https://www.cityofpaloalto.org',
};

export const SOLANO: SourceDefinition = {
  id: 'solano',
  name: 'Solano County Parcels',
  country: 'US',
  region: 'California',
  city: 'Solano County',
  api: {
    type: 'arcgis',
    url: 'https://services2.arcgis.com/SCn6czzcqKAFwdGU/arcgis/rest/services/Parcels_Public_Aumentum/FeatureServer/0/query',
    outFields: [
      'parcelid',
      'yrbuilt',
      'sitecity',
      'sitenum',
      'siteroad',
      'usecode',
      'use_desc',
      'lotsize',
      'total_area',
      'stories',
      'bedroom',
      'bathroom',
    ],
    where: 'yrbuilt > 1800',
  },
  schema: {
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
  expectedCount: 155000,
  updateFrequency: 'monthly',
  attribution: 'Solano County',
  attributionUrl: 'https://www.solanocounty.com',
};

export const LIVERMORE: SourceDefinition = {
  id: 'livermore',
  name: 'Livermore Parcels',
  country: 'US',
  region: 'California',
  city: 'Livermore',
  api: {
    type: 'arcgis',
    url: 'https://gis.cityoflivermore.net/arcgis/rest/services/Parcels/FeatureServer/0/query',
    outFields: [
      'APN',
      'YrBuilt',
      'EffYr',
      'SitusNum',
      'SitusStreet',
      'SitusCity',
      'LandUseDescription',
      'LandUseCategory',
      'LotSize',
      'BldgArea',
      'Stories',
      'Beds',
      'Baths',
    ],
  },
  schema: {
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
  expectedCount: 52000,
  updateFrequency: 'monthly',
  attribution: 'City of Livermore',
  attributionUrl: 'https://www.cityoflivermore.net',
};

// ============================================================================
// Other US Sources
// ============================================================================

export const LA_COUNTY: SourceDefinition = {
  id: 'la-county',
  name: 'LA County Parcels',
  country: 'US',
  region: 'California',
  api: {
    type: 'arcgis',
    url: 'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/LA_County_Parcels/FeatureServer/0/query',
    outFields: [
      'APN',
      'YearBuilt1',
      'EffectiveYear1',
      'UseCode',
      'UseType',
      'UseDescription',
      'SitusFullAddress',
      'SitusCity',
      'SitusZIP',
      'SQFTmain1',
      'Units1',
      'Bedrooms1',
      'Bathrooms1',
      'Roll_LandValue',
      'Roll_ImpValue',
    ],
  },
  schema: {
    sourceId: 'la-county',
    fieldMapping: {
      id: 'APN',
      yearBuilt: ['YearBuilt1', 'EffectiveYear1'],
      effectiveYear: 'EffectiveYear1',
      landUse: 'UseDescription',
      address: 'SitusFullAddress',
      city: 'SitusCity',
      area: 'SQFTmain1',
      units: 'Units1',
    },
    areaUnit: 'sqft',
  },
  expectedCount: 2400000,
  updateFrequency: 'monthly',
  attribution: 'LA County Assessor',
  attributionUrl: 'https://assessor.lacounty.gov',
  notes: 'Large dataset (2.4M parcels). Use streaming with NDJSON output.',
};

export const NYC_PLUTO: SourceDefinition = {
  id: 'nyc-pluto',
  name: 'NYC PLUTO Tax Lots',
  country: 'US',
  region: 'New York',
  city: 'New York City',
  api: {
    type: 'socrata',
    url: 'https://data.cityofnewyork.us/resource/64uk-42ks.json',
    fields: [
      'bbl',
      'yearbuilt',
      'landuse',
      'bldgclass',
      'address',
      'zipcode',
      'borough',
      'block',
      'lot',
      'numfloors',
      'unitsres',
      'unitstotal',
      'lotarea',
      'bldgarea',
      'assesstot',
      'latitude',
      'longitude',
    ],
  },
  schema: {
    sourceId: 'nyc-pluto',
    fieldMapping: {
      id: 'bbl',
      yearBuilt: 'yearbuilt',
      landUse: 'landuse',
      address: 'address',
      area: 'bldgarea',
      stories: 'numfloors',
      units: 'unitsres',
    },
    areaUnit: 'sqft',
  },
  expectedCount: 857000,
  updateFrequency: 'monthly',
  attribution: 'NYC Open Data',
  attributionUrl: 'https://data.cityofnewyork.us',
  license: 'Open Data',
  notes: 'Has latitude/longitude fields for point geometry construction.',
};

export const CLARK_COUNTY: SourceDefinition = {
  id: 'clark-county',
  name: 'Clark County Parcels',
  country: 'US',
  region: 'Nevada',
  city: 'Las Vegas',
  api: {
    type: 'arcgis',
    url: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Layers/MapServer/1/query',
    outFields: ['APN', 'PARCELTYPE', 'Label_Class', 'ASSR_ACRES'],
  },
  schema: {
    sourceId: 'clark-county',
    fieldMapping: {
      id: 'APN',
      landUse: 'PARCELTYPE',
      area: 'ASSR_ACRES',
    },
    areaUnit: 'acres',
  },
  expectedCount: 700000,
  updateFrequency: 'monthly',
  attribution: 'Clark County Assessor',
  attributionUrl: 'https://www.clarkcountynv.gov/assessor',
  notes: 'Multi-endpoint source with parcel polygons, points, subdivisions, and yearly Added layers.',
};

// Clark County endpoints for multi-endpoint fetching
export const CLARK_COUNTY_ENDPOINTS = {
  parcels: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/ParcelHistory/MapServer/0/query',
  polygons: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Layers/MapServer/1/query',
  subdivisions: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/AOSubdivisions/MapServer/0/query',
  added2017: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2017/MapServer/0/query',
  added2018: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2018/MapServer/0/query',
  added2019: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2019/MapServer/0/query',
  added2020: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/Added_2020/MapServer/0/query',
  addedCurrent: 'https://maps.clarkcountynv.gov/arcgis/rest/services/Assessor/added_current/FeatureServer/0/query',
};

// ============================================================================
// International Sources
// ============================================================================

export const TORONTO: SourceDefinition = {
  id: 'toronto',
  name: 'Toronto Building Permits',
  country: 'CA',
  region: 'Ontario',
  city: 'Toronto',
  api: {
    type: 'socrata',
    url: 'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/building-permits-cleared-permits/resource/building-permits-cleared-permits',
    fields: [
      '_id',
      'PERMIT_NUM',
      'PERMIT_TYPE',
      'STRUCTURE_TYPE',
      'WORK_TYPE',
      'STREET_NUM',
      'STREET_NAME',
      'STREET_TYPE',
      'ISSUED_DATE',
      'COMPLETED_DATE',
      'APPLICATION_DATE',
      'GEO_LAT',
      'GEO_LONG',
    ],
  },
  schema: {
    sourceId: 'toronto',
    fieldMapping: {
      id: 'PERMIT_NUM',
      yearBuilt: 'COMPLETED_DATE',
      landUse: 'STRUCTURE_TYPE',
      address: ['STREET_NUM', 'STREET_NAME', 'STREET_TYPE'],
    },
    dateFormat: 'iso',
  },
  expectedCount: 500000,
  updateFrequency: 'weekly',
  attribution: 'City of Toronto Open Data',
  attributionUrl: 'https://open.toronto.ca',
  license: 'Open Government Licence - Toronto',
  notes: 'Building permits from 2001 onwards. Year represents permit completion date.',
};

export const AMSTERDAM_BAG: SourceDefinition = {
  id: 'amsterdam',
  name: 'Amsterdam Buildings (BAG)',
  country: 'NL',
  region: 'Noord-Holland',
  city: 'Amsterdam',
  api: {
    type: 'generic',
    buildUrl: (offset, batchSize) => {
      // PDOK BAG OGC API Features - Amsterdam bounding box
      return `https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=4.7,52.28,5.1,52.45&limit=${batchSize}&offset=${offset}&f=json`;
    },
    extractFeatures: (response: unknown) => {
      const data = response as { features?: unknown[] };
      return data.features || [];
    },
    hasMore: (response: unknown, features: unknown[], offset: number) => {
      const data = response as { numberMatched?: number };
      return features.length > 0 && offset + features.length < (data.numberMatched || 0);
    },
  },
  schema: {
    sourceId: 'amsterdam',
    fieldMapping: {
      id: 'identificatie',
      yearBuilt: 'bouwjaar',
      landUse: 'gebruiksdoel',
      units: 'aantal_verblijfsobjecten',
    },
  },
  expectedCount: 190000,
  updateFrequency: 'daily',
  attribution: 'PDOK / Kadaster',
  attributionUrl: 'https://www.pdok.nl',
  license: 'CC0 Public Domain',
  notes: 'Dutch national building registry (BAG). bouwjaar is construction year.',
};

export const PARIS_APUR: SourceDefinition = {
  id: 'paris',
  name: 'Paris Buildings (APUR)',
  country: 'FR',
  region: 'Île-de-France',
  city: 'Paris',
  api: {
    type: 'arcgis',
    url: 'https://carto2.apur.org/apur/rest/services/OPENDATA/EMPRISE_BATIE_PARIS/MapServer/0/query',
    outFields: [
      'OBJECTID',
      'an_const',
      'c_perconst',
      'an_rehab',
      'h_moy',
      'c_morpho',
      'c_tissu',
      'Shape_Area',
    ],
    outSR: 4326,
  },
  schema: {
    sourceId: 'paris',
    fieldMapping: {
      id: 'OBJECTID',
      yearBuilt: 'an_const',
      area: 'Shape_Area',
    },
    areaUnit: 'sqm',
  },
  expectedCount: 120000,
  updateFrequency: 'monthly',
  attribution: 'APUR (Atelier Parisien d\'Urbanisme)',
  attributionUrl: 'https://opendata.apur.org',
  license: 'ODbL',
  notes: 'AN_CONST is year, C_PERCONST is construction period code (1-12).',
};

export const LONDON_PLANNING: SourceDefinition = {
  id: 'london-planning',
  name: 'London Planning Applications',
  country: 'GB',
  region: 'England',
  city: 'London',
  api: {
    type: 'generic',
    buildUrl: (offset, batchSize) => {
      // London Datastore uses CKAN API
      return `https://data.london.gov.uk/api/3/action/datastore_search?resource_id=planning-applications&limit=${batchSize}&offset=${offset}`;
    },
    extractFeatures: (response: unknown) => {
      const data = response as { result?: { records?: unknown[] } };
      return data.result?.records || [];
    },
    hasMore: (response: unknown, features: unknown[]) => {
      const data = response as { result?: { total?: number } };
      return features.length > 0 && (data.result?.total || 0) > features.length;
    },
  },
  schema: {
    sourceId: 'london-planning',
    fieldMapping: {
      id: 'application_number',
      yearBuilt: 'decision_date',
      landUse: 'development_type',
      address: 'site_address',
    },
    dateFormat: 'eu',
    sourceCRS: 'EPSG:27700', // British National Grid
  },
  expectedCount: 100000,
  updateFrequency: 'weekly',
  attribution: 'Greater London Authority',
  attributionUrl: 'https://data.london.gov.uk',
  license: 'Open Government Licence v3.0',
  notes: 'Planning applications across London boroughs. Requires coordinate reprojection from BNG.',
};

// ============================================================================
// Registry
// ============================================================================

export const SOURCES: Record<string, SourceDefinition> = {
  // Bay Area
  'sf-urban': SF_URBAN,
  campbell: CAMPBELL,
  'palo-alto': PALO_ALTO,
  solano: SOLANO,
  livermore: LIVERMORE,
  // Other US
  'la-county': LA_COUNTY,
  'nyc-pluto': NYC_PLUTO,
  'clark-county': CLARK_COUNTY,
  // International
  toronto: TORONTO,
  'london-planning': LONDON_PLANNING,
  amsterdam: AMSTERDAM_BAG,
  paris: PARIS_APUR,
};

export function getSource(id: string): SourceDefinition {
  const source = SOURCES[id];
  if (!source) {
    throw new Error(`Unknown source: ${id}. Available: ${Object.keys(SOURCES).join(', ')}`);
  }
  return source;
}

export function listSources(): SourceDefinition[] {
  return Object.values(SOURCES);
}

export function listSourcesByCountry(country: string): SourceDefinition[] {
  return Object.values(SOURCES).filter((s) => s.country === country);
}

export function listSourcesByRegion(region: string): SourceDefinition[] {
  return Object.values(SOURCES).filter((s) => s.region === region);
}
