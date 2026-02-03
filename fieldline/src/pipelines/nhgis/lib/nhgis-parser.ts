/**
 * NHGIS extract parser.
 *
 * Parses CSV data and shapefiles from NHGIS extracts,
 * joining them by GISJOIN to create GeoJSON features.
 */

import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import * as shapefile from 'shapefile';
import { NEVADA_GISJOIN_PREFIX, getDensityColor } from './variable-mapping.js';

export interface NHGISRecord {
  gisjoin: string;
  year: number;
  name: string;
  state: string;
  totalPop: number;
  housingUnits?: number;
  areaLand?: number;  // sq meters from shapefile
}

export interface NHGISFeature {
  type: 'Feature';
  properties: {
    gisjoin: string;
    name: string;
    year: number;
    startTime: string;
    totalPop: number;
    housingUnits?: number;
    area: number;       // sq miles
    popDensity: number;
    color: string;
  };
  geometry: GeoJSON.Geometry;
}

/**
 * Parse a CSV file from an NHGIS extract.
 * NHGIS CSVs use a specific format with metadata columns followed by data columns.
 */
export async function parseCSV(csvPath: string): Promise<Map<string, NHGISRecord>> {
  const content = await readFile(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    throw new Error(`CSV file ${csvPath} has no data rows`);
  }

  const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const records = new Map<string, NHGISRecord>();

  // Find column indices
  const gisJoinIdx = header.findIndex(h => h.toUpperCase() === 'GISJOIN');
  const yearIdx = header.findIndex(h => h.toUpperCase() === 'YEAR');
  const nameIdx = header.findIndex(h => h.toUpperCase() === 'COUNTY' || h.toUpperCase() === 'NAME');
  const stateIdx = header.findIndex(h => h.toUpperCase() === 'STATE' || h.toUpperCase() === 'STATEA');

  if (gisJoinIdx === -1) {
    throw new Error(`CSV file ${csvPath} missing GISJOIN column`);
  }

  // Find data columns (they come after metadata columns)
  // NHGIS data columns typically start after STUSAB or similar metadata
  const dataColumns: Array<{ idx: number; name: string }> = [];
  for (let i = 0; i < header.length; i++) {
    const col = header[i];
    // Data columns are typically uppercase letters followed by numbers
    if (/^[A-Z][A-Z0-9]+\d{3}$/.test(col)) {
      dataColumns.push({ idx: i, name: col });
    }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < header.length) continue;

    const gisjoin = values[gisJoinIdx]?.replace(/"/g, '') || '';

    // Filter to Nevada counties only
    if (!gisjoin.startsWith(NEVADA_GISJOIN_PREFIX)) continue;

    const year = yearIdx >= 0 ? parseInt(values[yearIdx], 10) : 0;
    const name = (nameIdx >= 0 ? values[nameIdx] : '').replace(/"/g, '').replace(/ County$/, '');
    const state = stateIdx >= 0 ? values[stateIdx]?.replace(/"/g, '') : '';

    // Parse data values
    let totalPop = 0;
    let housingUnits: number | undefined;

    for (const { idx, name: colName } of dataColumns) {
      const value = parseFloat(values[idx]) || 0;

      // Population columns (ending in 001, first in sequence)
      if (colName.endsWith('001') && !colName.includes('H')) {
        totalPop = value;
      }
      // Housing columns (contain H in table name)
      if (colName.includes('H') && colName.endsWith('001')) {
        housingUnits = value;
      }
    }

    // Also try generic population column patterns
    if (totalPop === 0) {
      for (const { idx, name: colName } of dataColumns) {
        const value = parseFloat(values[idx]) || 0;
        // Any column ending in 001 might be population total
        if (colName.endsWith('001') && value > 0) {
          totalPop = value;
          break;
        }
      }
    }

    records.set(gisjoin, {
      gisjoin,
      year,
      name,
      state,
      totalPop,
      housingUnits,
    });
  }

  return records;
}

/**
 * Parse a single CSV line, handling quoted values with commas.
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

/**
 * Parse a shapefile from an NHGIS extract.
 * Returns features keyed by GISJOIN.
 */
export async function parseShapefile(
  shpPath: string
): Promise<Map<string, { geometry: GeoJSON.Geometry; areaLand: number }>> {
  const features = new Map<string, { geometry: GeoJSON.Geometry; areaLand: number }>();

  const source = await shapefile.open(shpPath);

  let result = await source.read();
  while (!result.done) {
    const feature = result.value as GeoJSON.Feature;
    const props = feature.properties || {};

    // GISJOIN is the key field
    const gisjoin = props.GISJOIN || props.gisjoin || '';

    // Filter to Nevada
    if (gisjoin.startsWith(NEVADA_GISJOIN_PREFIX)) {
      // ALAND is area in square meters
      const areaLand = props.ALAND || props.ALAND10 || props.ALAND20 || 0;

      features.set(gisjoin, {
        geometry: feature.geometry,
        areaLand: areaLand,
      });
    }

    result = await source.read();
  }

  return features;
}

/**
 * Join CSV records with shapefile geometries to create GeoJSON features.
 */
export function joinRecordsWithGeometry(
  records: Map<string, NHGISRecord>,
  geometries: Map<string, { geometry: GeoJSON.Geometry; areaLand: number }>
): NHGISFeature[] {
  const features: NHGISFeature[] = [];

  for (const [gisjoin, record] of records) {
    const geo = geometries.get(gisjoin);
    if (!geo) {
      console.warn(`No geometry found for ${gisjoin} (${record.name})`);
      continue;
    }

    // Calculate area in square miles (from sq meters)
    const areaSqMiles = geo.areaLand > 0
      ? geo.areaLand / 2589988.11  // sq meters to sq miles
      : 0;

    // Calculate population density
    const popDensity = areaSqMiles > 0 ? record.totalPop / areaSqMiles : 0;

    features.push({
      type: 'Feature',
      properties: {
        gisjoin: record.gisjoin,
        name: record.name,
        year: record.year,
        startTime: `${record.year}-01-01T00:00:00Z`,
        totalPop: record.totalPop,
        ...(record.housingUnits !== undefined && { housingUnits: record.housingUnits }),
        area: Math.round(areaSqMiles),
        popDensity: Math.round(popDensity * 10) / 10,
        color: getDensityColor(popDensity),
      },
      geometry: geo.geometry,
    });
  }

  return features;
}

/**
 * Find and parse all CSV files in a directory.
 */
export async function parseAllCSVs(dir: string): Promise<Map<string, NHGISRecord>> {
  const files = await readdir(dir);
  const csvFiles = files.filter(f => f.endsWith('.csv'));

  const allRecords = new Map<string, NHGISRecord>();

  for (const csvFile of csvFiles) {
    const csvPath = join(dir, csvFile);
    console.log(`Parsing ${csvFile}...`);
    const records = await parseCSV(csvPath);
    console.log(`  Found ${records.size} Nevada county records`);

    for (const [key, record] of records) {
      // Key by gisjoin + year for multi-year data
      const uniqueKey = `${record.gisjoin}_${record.year}`;
      allRecords.set(uniqueKey, record);
    }
  }

  return allRecords;
}

/**
 * Find and parse all shapefiles in a directory.
 * Returns geometries keyed by GISJOIN (may have multiple versions for different years).
 */
export async function parseAllShapefiles(
  dir: string
): Promise<Map<number, Map<string, { geometry: GeoJSON.Geometry; areaLand: number }>>> {
  const files = await readdir(dir);
  const shpFiles = files.filter(f => f.endsWith('.shp'));

  const geometriesByYear = new Map<number, Map<string, { geometry: GeoJSON.Geometry; areaLand: number }>>();

  for (const shpFile of shpFiles) {
    const shpPath = join(dir, shpFile);

    // Extract year from filename (e.g., us_county_1870_tl2008.shp)
    const yearMatch = shpFile.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;

    console.log(`Parsing ${shpFile} (year: ${year})...`);
    const geometries = await parseShapefile(shpPath);
    console.log(`  Found ${geometries.size} Nevada county geometries`);

    if (year > 0) {
      geometriesByYear.set(year, geometries);
    }
  }

  return geometriesByYear;
}
