/**
 * Western US (California + Nevada) NHGIS processing pipeline.
 *
 * Processes downloaded NHGIS data into visualization-ready GeoJSON.
 * Uses historical county boundaries from NHGIS shapefiles for each decade.
 *
 * Usage:
 *   pnpm --filter fieldline pipeline:nhgis-western
 */

import { readdir, readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { join, basename } from 'node:path';
import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import { getDensityColor } from './lib/variable-mapping.js';

// NHGIS shapefiles use USA Contiguous Albers Equal Area Conic (ESRI:102003)
proj4.defs(
  'ESRI:102003',
  '+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +x_0=0 +y_0=0 +ellps=GRS80 +datum=NAD83 +units=m +no_defs'
);

const INPUT_DIR = new URL('../../data/raw/nhgis/nevada-historical', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../../chrona/public/data/nhgis-western', import.meta.url).pathname;

// Western states: Arizona (04), California (06), Idaho (16), Nevada (32), Oregon (41), Utah (49), Washington (53)
const WESTERN_STATE_FIPS = ['G04', 'G06', 'G16', 'G32', 'G41', 'G49', 'G53'];

function isWesternState(gisjoin: string): boolean {
  return WESTERN_STATE_FIPS.some(fips => gisjoin.startsWith(fips));
}

/**
 * Reproject a coordinate from Albers to WGS84
 */
function reprojectCoord(coord: number[]): number[] {
  const [lng, lat] = proj4('ESRI:102003', 'EPSG:4326', [coord[0], coord[1]]);
  return [lng, lat];
}

/**
 * Reproject a GeoJSON geometry from Albers to WGS84
 */
function reprojectGeometry(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(ring => ring.map(reprojectCoord)),
    };
  } else if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map(poly =>
        poly.map(ring => ring.map(reprojectCoord))
      ),
    };
  } else if (geometry.type === 'Point') {
    return {
      type: 'Point',
      coordinates: reprojectCoord(geometry.coordinates),
    };
  }
  // Return as-is for other types (shouldn't happen for county boundaries)
  return geometry;
}

interface CountyBoundary {
  geometry: GeoJSON.Geometry;
  name: string;
  gisjoin: string;
  areaLand?: number;
}

interface CensusRecord {
  gisjoin: string;
  year: number;
  state: string;
  county: string;
  totalPop: number;
}

/**
 * Load historical county boundaries from NHGIS shapefiles for a specific year.
 * Returns a map of GISJOIN code to boundary data.
 */
async function loadHistoricalBoundaries(year: number): Promise<Map<string, CountyBoundary>> {
  const boundaries = new Map<string, CountyBoundary>();

  // Determine shapefile path based on year
  const shapeDir = join(INPUT_DIR, 'gis_data', 'nhgis0014_shape');
  let shapeSubdir: string;
  let shapeFile: string;

  if (year === 2020) {
    shapeSubdir = 'nhgis0014_shapefile_tl2020_us_county_2020';
    shapeFile = 'US_county_2020.shp';
  } else if (year === 2010) {
    shapeSubdir = 'nhgis0014_shapefile_tl2010_us_county_2010';
    shapeFile = 'US_county_2010.shp';
  } else {
    shapeSubdir = `nhgis0014_shapefile_tl2008_us_county_${year}`;
    shapeFile = `US_county_${year}_conflated.shp`;
  }

  const shapePath = join(shapeDir, shapeSubdir, shapeFile);

  try {
    const source = await shapefile.open(shapePath);

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value as GeoJSON.Feature;
      const props = feature.properties || {};

      // NHGIS shapefiles use GISJOIN as the key
      const gisjoin = props.GISJOIN as string;
      if (!gisjoin) continue;

      // Filter to Western states (California + Nevada)
      if (!isWesternState(gisjoin)) continue;

      // Get county name (different field names in different years)
      const name = (props.NHGISNAM as string) ||
                   (props.NAME as string) ||
                   (props.BASENAME as string) ||
                   '';

      // ALAND/AREALAND is in square meters (available in newer shapefiles)
      const areaLand = props.ALAND || props.AREALAND || 0;

      boundaries.set(gisjoin, {
        geometry: reprojectGeometry(feature.geometry),
        name: name.replace(/ County$/, ''),
        gisjoin,
        areaLand,
      });
    }

    console.log(`  ${year}: Loaded ${boundaries.size} Western US county boundaries`);
  } catch (err) {
    console.warn(`  ${year}: Could not load shapefile (${(err as Error).message})`);
  }

  return boundaries;
}

async function findCSVFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.endsWith('.csv') && !entry.name.includes('codebook')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  await walk(dir);
  return results;
}

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

async function parseCSV(csvPath: string): Promise<CensusRecord[]> {
  const content = await readFile(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map(h => h.toUpperCase());
  const records: CensusRecord[] = [];

  // Find column indices
  const gisJoinIdx = header.findIndex(h => h === 'GISJOIN');
  const yearIdx = header.findIndex(h => h === 'YEAR');
  const stateIdx = header.findIndex(h => h === 'STATE');
  const countyIdx = header.findIndex(h => h === 'COUNTY');

  if (gisJoinIdx === -1) {
    console.warn(`  No GISJOIN column in ${csvPath}`);
    return [];
  }

  // Find NHGIS data columns - they have names like U7H001, AJ3001 (end with 3+ digit sequence)
  // These are table columns that end with column numbers (001, 002, etc.)
  const dataColumnIndices: number[] = [];
  for (let i = 0; i < header.length; i++) {
    // NHGIS data columns end with 3+ digits (table column numbers)
    if (/^[A-Z][A-Z0-9]*[0-9]{3,}$/.test(header[i])) {
      dataColumnIndices.push(i);
    }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length <= gisJoinIdx) continue;

    const gisjoin = values[gisJoinIdx]?.replace(/"/g, '') || '';

    // Filter to Western states (California + Nevada)
    if (!isWesternState(gisjoin)) continue;

    const year = yearIdx >= 0 ? parseInt(values[yearIdx], 10) : 0;
    const state = stateIdx >= 0 ? values[stateIdx]?.replace(/"/g, '') : '';
    const county = countyIdx >= 0 ? values[countyIdx]?.replace(/"/g, '').replace(/ County$/, '') : '';

    // Get population from first NHGIS data column (total population)
    let totalPop = 0;
    if (dataColumnIndices.length > 0) {
      const val = parseInt(values[dataColumnIndices[0]], 10);
      if (!isNaN(val) && val > 0) {
        totalPop = val;
      }
    }

    if (totalPop > 0) {
      records.push({ gisjoin, year, state, county, totalPop });
    }
  }

  return records;
}

async function main() {
  console.log('NHGIS Western US Processing Pipeline');
  console.log('====================================\n');

  // Find all CSV files
  const csvFiles = await findCSVFiles(INPUT_DIR);
  console.log(`Found ${csvFiles.length} CSV files\n`);

  if (csvFiles.length === 0) {
    console.error('Error: No CSV files found. Run the extract pipeline first:');
    console.error('  NHGIS_API_KEY=your_key pnpm --filter fieldline pipeline:nhgis-nevada-extract');
    process.exit(1);
  }

  // Parse all CSV files
  console.log('Parsing CSV data...');
  const allRecords: CensusRecord[] = [];

  for (const csvFile of csvFiles) {
    const fileName = basename(csvFile);
    const records = await parseCSV(csvFile);
    if (records.length > 0) {
      console.log(`  ${fileName}: ${records.length} Western US records`);
      allRecords.push(...records);
    }
  }

  console.log(`\nTotal: ${allRecords.length} county-year records\n`);

  // Group records by year
  const byYear = new Map<number, CensusRecord[]>();
  for (const record of allRecords) {
    const list = byYear.get(record.year) || [];
    list.push(record);
    byYear.set(record.year, list);
  }

  // Load historical boundaries for each year
  console.log('Loading historical county boundaries...');
  const boundariesByYear = new Map<number, Map<string, CountyBoundary>>();
  for (const year of byYear.keys()) {
    const boundaries = await loadHistoricalBoundaries(year);
    boundariesByYear.set(year, boundaries);
  }

  // Create GeoJSON features
  console.log('\nCreating GeoJSON features...');
  const features: GeoJSON.Feature[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const [year, records] of byYear) {
    const boundaries = boundariesByYear.get(year);
    if (!boundaries) continue;

    for (const record of records) {
      const boundary = boundaries.get(record.gisjoin);

      if (boundary) {
        // Calculate area in sq miles from shapefile if available, otherwise estimate
        let areaSqMiles: number;
        if (boundary.areaLand && boundary.areaLand > 0) {
          areaSqMiles = boundary.areaLand / 2589988.11; // sq meters to sq miles
        } else {
          // Estimate area from bounding box if no area data
          areaSqMiles = estimateAreaFromGeometry(boundary.geometry);
        }

        const popDensity = areaSqMiles > 0 ? record.totalPop / areaSqMiles : 0;

        // End time is the next census (10 years later)
        const endYear = record.year + 10;

        features.push({
          type: 'Feature',
          properties: {
            gisjoin: record.gisjoin,
            name: boundary.name || record.county,
            year: record.year,
            startTime: `${record.year}-01-01T00:00:00Z`,
            endTime: `${endYear}-01-01T00:00:00Z`,
            totalPop: record.totalPop,
            area: Math.round(areaSqMiles),
            popDensity: Math.round(popDensity * 10) / 10,
            color: getDensityColor(popDensity),
          },
          geometry: boundary.geometry,
        });
        matched++;
      } else {
        console.warn(`  No boundary for: ${record.gisjoin} (${record.county}) in ${year}`);
        unmatched++;
      }
    }
  }

  // Sort by year, then name
  features.sort((a, b) => {
    const yearDiff = (a.properties!.year as number) - (b.properties!.year as number);
    if (yearDiff !== 0) return yearDiff;
    return (a.properties!.name as string).localeCompare(b.properties!.name as string);
  });

  console.log(`Created ${features.length} features (${matched} matched, ${unmatched} unmatched)\n`);

  // Summary by year
  console.log('Summary by year:');
  const yearFeatures = new Map<number, GeoJSON.Feature[]>();
  for (const f of features) {
    const year = f.properties!.year as number;
    const list = yearFeatures.get(year) || [];
    list.push(f);
    yearFeatures.set(year, list);
  }

  for (const [year, yf] of Array.from(yearFeatures.entries()).sort((a, b) => a[0] - b[0])) {
    const totalPop = yf.reduce((sum, f) => sum + (f.properties!.totalPop as number), 0);
    console.log(`  ${year}: ${yf.length} counties, ${totalPop.toLocaleString()} total pop`);
  }

  // Write output - stream to avoid string length limits
  await mkdir(OUTPUT_DIR, { recursive: true });

  const outputPath = join(OUTPUT_DIR, 'counties.geojson');
  const file = await open(outputPath, 'w');

  await file.write('{"type":"FeatureCollection","features":[');
  for (let i = 0; i < features.length; i++) {
    if (i > 0) await file.write(',');
    await file.write(JSON.stringify(features[i]));
  }
  await file.write(']}');
  await file.close();

  console.log(`\nWrote ${outputPath}`);

  // Write metadata
  const metadata = {
    name: 'Western US Census Data (AZ, CA, ID, NV, OR, UT, WA)',
    source: 'NHGIS (IPUMS)',
    years: Array.from(yearFeatures.keys()).sort((a, b) => a - b),
    totalFeatures: features.length,
    variables: ['totalPop', 'popDensity', 'area'],
    historicalBoundaries: true,
    generatedAt: new Date().toISOString(),
  };

  const metadataPath = join(OUTPUT_DIR, 'metadata.json');
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`Wrote ${metadataPath}`);

  console.log('\nProcessing complete!');
}

/**
 * Rough area estimate from geometry bounding box (fallback when no area data).
 */
function estimateAreaFromGeometry(geometry: GeoJSON.Geometry): number {
  // For rough estimates, use 1 degree ≈ 69 miles at Nevada latitudes
  const milesPerDegree = 69;

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0];
    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const width = (Math.max(...lons) - Math.min(...lons)) * milesPerDegree * 0.85; // cos(39°) ≈ 0.78
    const height = (Math.max(...lats) - Math.min(...lats)) * milesPerDegree;
    return width * height * 0.6; // rough correction for non-rectangular shapes
  } else if (geometry.type === 'MultiPolygon') {
    let totalArea = 0;
    for (const poly of geometry.coordinates) {
      const coords = poly[0];
      const lons = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      const width = (Math.max(...lons) - Math.min(...lons)) * milesPerDegree * 0.85;
      const height = (Math.max(...lats) - Math.min(...lats)) * milesPerDegree;
      totalArea += width * height * 0.6;
    }
    return totalArea;
  }

  return 1000; // fallback for unknown geometry types
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
