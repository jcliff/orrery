/**
 * NHGIS variable code mappings.
 *
 * NHGIS uses specific codes for datasets, tables, and geographic levels.
 * This file maps these codes to human-readable names and provides
 * table configurations for each census year.
 */

/**
 * NHGIS dataset names by census year.
 * Format: {year}_{dataset_type}
 */
export const DATASETS_BY_YEAR: Record<number, string> = {
  1870: '1870_cPAX',   // Population, Agriculture & Other Data [US, States & Counties]
  1880: '1880_cPAX',   // Population, Agriculture & Other Data [US, States & Counties]
  1890: '1890_cPHAM',  // Population, Housing, Agriculture & Manufacturing Data
  1900: '1900_cPHAM',  // Population, Housing, Agriculture & Manufacturing Data
  1910: '1910_cPHA',   // Population, Housing & Agriculture Data [US, States & Counties]
  1920: '1920_cPHAM',  // Population, Housing, Agriculture & Manufacturing Data
  1930: '1930_cPAE',   // Population, Agriculture & Economic Data [US, States & Counties]
  1940: '1940_cPHAE',  // Population, Housing, Agriculture & Economic Data
  1950: '1950_cPHA',   // Population, Housing & Agriculture Data
  1960: '1960_cPop',   // Population Data [US, States, Counties]
  1970: '1970_Cnt1',   // Count 1
  1980: '1980_STF1',   // Summary Tape File 1
  1990: '1990_STF1',   // Summary Tape File 1
  2000: '2000_SF1a',   // Summary File 1a
  2010: '2010_SF1a',   // Summary File 1a
  2020: '2020_DHCa',   // Demographic and Housing Characteristics File a
};

/**
 * Data table codes for total population by year.
 * These are the NHGIS table codes that contain total population counts.
 */
export const TOTAL_POP_TABLES: Record<number, string> = {
  1870: 'NT1',    // Total Population
  1880: 'NT1',
  1890: 'NT1',
  1900: 'NT1',
  1910: 'NT1',
  1920: 'NT1',
  1930: 'NT1',
  1940: 'NT1',
  1950: 'NT1',
  1960: 'NT1',
  1970: 'NT1',
  1980: 'NT1A',   // Total Persons
  1990: 'NP1',    // Total Persons
  2000: 'NP001A', // Total Population
  2010: 'P1',     // Total Population
  2020: 'P1',     // Total Population
};

/**
 * Data table codes for housing units by year.
 * Housing data starts in 1940.
 * Note: Disabled for now - need to verify correct table codes
 */
export const HOUSING_TABLES: Record<number, string> = {
  // Temporarily disabled until we verify the correct housing table codes
  // 1940: 'NT9A',   // Total Housing Units
  // 1950: 'NT11',
  // 1960: 'NT70',
  // 1970: 'NT87',
  // 1980: 'NH1A',   // Total Housing Units
  // 1990: 'NH1',    // Total Housing Units
  // 2000: 'NH001A', // Total Housing Units
  // 2010: 'H7X001', // Total Housing Units
  // 2020: 'U7D001', // Total Housing Units
};

/**
 * Geographic level codes.
 */
export const GEOG_LEVELS = {
  county: 'county',
  tract: 'tract',
  place: 'place',
  state: 'state',
  nation: 'nation',
};

/**
 * Datasets with tract-level data (2000-2020).
 * Census tracts have comprehensive coverage starting in 2000.
 */
export const TRACT_DATASETS: Record<number, string> = {
  2000: '2000_SF1a',
  2010: '2010_SF1a',
  2020: '2020_DHCa',
};

/**
 * Datasets with place-level data (cities/towns).
 * Places have good coverage from 1970 onward.
 */
export const PLACE_DATASETS: Record<number, string> = {
  1970: '1970_Cnt1',
  1980: '1980_STF1',
  1990: '1990_STF1',
  2000: '2000_SF1a',
  2010: '2010_SF1a',
  2020: '2020_DHCa',
};

/**
 * State FIPS code for Nevada.
 */
export const NEVADA_FIPS = '32';

/**
 * Nevada county GISJOIN prefixes (for filtering).
 * GISJOIN format: G{state}{county}
 */
export const NEVADA_GISJOIN_PREFIX = 'G320';

/**
 * Shapefile names for historical county boundaries.
 * These include boundary changes over time.
 */
export const SHAPEFILE_BY_YEAR: Record<number, string> = {
  1870: 'us_county_1870_tl2008',
  1880: 'us_county_1880_tl2008',
  1890: 'us_county_1890_tl2008',
  1900: 'us_county_1900_tl2008',
  1910: 'us_county_1910_tl2008',
  1920: 'us_county_1920_tl2008',
  1930: 'us_county_1930_tl2008',
  1940: 'us_county_1940_tl2008',
  1950: 'us_county_1950_tl2008',
  1960: 'us_county_1960_tl2008',
  1970: 'us_county_1970_tl2008',
  1980: 'us_county_1980_tl2008',
  1990: 'us_county_1990_tl2008',
  2000: 'us_county_2000_tl2008',
  2010: 'us_county_2010_tl2010',
  2020: 'us_county_2020_tl2020',
};

/**
 * Get all census years for Nevada (1870-2020).
 * Nevada achieved statehood in 1864, first census was 1870.
 */
export function getCensusYears(): number[] {
  return [1870, 1880, 1890, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
}

/**
 * Get data tables for a given year.
 * Returns population and housing tables (if available for that year).
 */
export function getDataTablesForYear(year: number): string[] {
  const tables: string[] = [];

  const popTable = TOTAL_POP_TABLES[year];
  if (popTable) tables.push(popTable);

  const housingTable = HOUSING_TABLES[year];
  if (housingTable) tables.push(housingTable);

  return tables;
}

/**
 * Parse NHGIS column name to extract variable info.
 * NHGIS columns are named like: {TableCode}{SequenceNumber}
 * Example: NP001A001 = Table NP001A, sequence 001 (Total Population)
 */
export function parseColumnName(column: string): { table: string; sequence: string } | null {
  // Match patterns like NP001A001, H7V001, etc.
  const match = column.match(/^([A-Z0-9]+?)(\d{3})$/);
  if (match) {
    return { table: match[1], sequence: match[2] };
  }
  return null;
}

/**
 * Mapping of column suffixes to readable property names.
 * The suffix is the sequence number from the column name.
 */
export const COLUMN_MAPPINGS: Record<string, string> = {
  // Population totals typically end in 001
  '001': 'totalPop',
};

/**
 * Population density color scale.
 * Returns a hex color for a given population density (people per sq mile).
 */
export function getDensityColor(density: number): string {
  // Color scale from light (low density) to dark (high density)
  if (density < 1) return '#f7fbff';      // Very rural
  if (density < 5) return '#deebf7';
  if (density < 10) return '#c6dbef';
  if (density < 25) return '#9ecae1';
  if (density < 50) return '#6baed6';
  if (density < 100) return '#4292c6';
  if (density < 250) return '#2171b5';
  if (density < 500) return '#08519c';
  return '#08306b';                        // Urban/dense
}

/**
 * Get a human-readable label for a density value.
 */
export function getDensityLabel(density: number): string {
  if (density < 1) return 'Very sparse (<1/sq mi)';
  if (density < 10) return 'Rural (1-10/sq mi)';
  if (density < 50) return 'Suburban (10-50/sq mi)';
  if (density < 250) return 'Urban (50-250/sq mi)';
  return 'Dense urban (>250/sq mi)';
}
