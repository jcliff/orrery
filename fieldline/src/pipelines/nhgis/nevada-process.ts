/**
 * Nevada NHGIS processing pipeline.
 *
 * Processes downloaded NHGIS data into visualization-ready GeoJSON.
 * Uses real county boundaries from Census TIGER/Line.
 *
 * Usage:
 *   pnpm --filter fieldline pipeline:nhgis-nevada
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDensityColor } from './lib/variable-mapping.js';

const INPUT_DIR = new URL('../../data/raw/nhgis/nevada', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../../chrona/public/data/nhgis-nevada', import.meta.url).pathname;
const BOUNDARIES_PATH = join(INPUT_DIR, 'counties-boundaries.geojson');

interface CountyBoundary {
  geometry: GeoJSON.Geometry;
  name: string;
  area: number; // sq miles
  geoid: string;
}

interface CensusRecord {
  gisjoin: string;
  year: number;
  state: string;
  county: string;
  totalPop: number;
}

/**
 * Convert FIPS GEOID (e.g., "32029") to NHGIS GISJOIN (e.g., "G3200290")
 */
function geoidToGisjoin(geoid: string): string {
  const state = geoid.slice(0, 2);
  const county = geoid.slice(2);
  return `G${state}0${county}0`;
}

/**
 * Load county boundaries from Census TIGER GeoJSON
 */
async function loadBoundaries(): Promise<Map<string, CountyBoundary>> {
  const boundaries = new Map<string, CountyBoundary>();

  try {
    const content = await readFile(BOUNDARIES_PATH, 'utf-8');
    const geojson = JSON.parse(content) as GeoJSON.FeatureCollection;

    for (const feature of geojson.features) {
      const props = feature.properties || {};
      const geoid = props.GEOID as string;
      const gisjoin = geoidToGisjoin(geoid);

      // AREALAND is in square meters
      const areaLand = parseFloat(props.AREALAND) || 0;
      const areaSqMiles = areaLand / 2589988.11;

      boundaries.set(gisjoin, {
        geometry: feature.geometry,
        name: (props.BASENAME as string) || (props.NAME as string)?.replace(' County', ''),
        area: Math.round(areaSqMiles),
        geoid,
      });
    }

    console.log(`Loaded ${boundaries.size} county boundaries from TIGER/Line`);
  } catch (err) {
    console.warn('Could not load county boundaries, using fallback geometries');
    console.warn('Run: curl -o fieldline/src/data/raw/nhgis/nevada/counties-boundaries.geojson "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where=STATE=\'32\'&outFields=*&f=geojson&outSR=4326"');
  }

  return boundaries;
}

// Fallback simplified geometries for historical counties that no longer exist
const HISTORICAL_COUNTIES: Record<string, { name: string; coords: number[][]; area: number }> = {
  'G3200250': { name: 'Ormsby', coords: [[-119.85,39.25],[-119.65,39.25],[-119.65,39.05],[-119.85,39.05],[-119.85,39.25]], area: 157 },
  'G3200255': { name: 'Rio Virgin', coords: [[-114.5,37.0],[-114.0,37.0],[-114.0,36.5],[-114.5,36.5],[-114.5,37.0]], area: 500 },
  'G3200275': { name: 'Roop', coords: [[-120.0,41.0],[-119.5,41.0],[-119.5,40.5],[-120.0,40.5],[-120.0,41.0]], area: 500 },
  'G3200279': { name: 'Roop', coords: [[-120.0,41.0],[-119.5,41.0],[-119.5,40.5],[-120.0,40.5],[-120.0,41.0]], area: 500 },
  'G3200350': { name: 'Bullfrog', coords: [[-117.0,37.5],[-116.5,37.5],[-116.5,37.0],[-117.0,37.0],[-117.0,37.5]], area: 1000 },
  'G3200360': { name: 'Roop', coords: [[-120.0,41.0],[-119.5,41.0],[-119.5,40.5],[-120.0,40.5],[-120.0,41.0]], area: 500 },
  'G3200370': { name: 'Lake', coords: [[-120.0,40.0],[-119.5,40.0],[-119.5,39.5],[-120.0,39.5],[-120.0,40.0]], area: 500 },
  'G3200800': { name: 'Pahute', coords: [[-116.5,37.5],[-116.0,37.5],[-116.0,37.0],[-116.5,37.0],[-116.5,37.5]], area: 500 },
  'G3200850': { name: 'St. Marys', coords: [[-117.0,41.0],[-116.5,41.0],[-116.5,40.5],[-117.0,40.5],[-117.0,41.0]], area: 500 },
};

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

    // Filter to Nevada only (GISJOIN starts with G32)
    if (!gisjoin.startsWith('G32')) continue;

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
  console.log('NHGIS Nevada Processing Pipeline');
  console.log('=================================\n');

  // Load real county boundaries
  const boundaries = await loadBoundaries();

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
    const fileName = csvFile.split('/').pop();
    const records = await parseCSV(csvFile);
    if (records.length > 0) {
      console.log(`  ${fileName}: ${records.length} Nevada records`);
      allRecords.push(...records);
    }
  }

  console.log(`\nTotal: ${allRecords.length} county-year records\n`);

  // Create GeoJSON features
  console.log('Creating GeoJSON features...');
  const features: GeoJSON.Feature[] = [];
  let usedRealBoundaries = 0;
  let usedFallback = 0;

  for (const record of allRecords) {
    let geometry: GeoJSON.Geometry;
    let name: string;
    let area: number;

    const boundary = boundaries.get(record.gisjoin);
    if (boundary) {
      geometry = boundary.geometry;
      name = boundary.name;
      area = boundary.area;
      usedRealBoundaries++;
    } else {
      // Try historical county fallback
      const historical = HISTORICAL_COUNTIES[record.gisjoin];
      if (historical) {
        geometry = { type: 'Polygon', coordinates: [historical.coords] };
        name = historical.name;
        area = historical.area;
        usedFallback++;
      } else {
        console.warn(`  No boundary for: ${record.gisjoin} (${record.county})`);
        continue;
      }
    }

    const popDensity = area > 0 ? record.totalPop / area : 0;

    features.push({
      type: 'Feature',
      properties: {
        gisjoin: record.gisjoin,
        name,
        year: record.year,
        startTime: `${record.year}-01-01T00:00:00Z`,
        totalPop: record.totalPop,
        area,
        popDensity: Math.round(popDensity * 10) / 10,
        color: getDensityColor(popDensity),
      },
      geometry,
    });
  }

  // Sort by year, then name
  features.sort((a, b) => {
    const yearDiff = (a.properties!.year as number) - (b.properties!.year as number);
    if (yearDiff !== 0) return yearDiff;
    return (a.properties!.name as string).localeCompare(b.properties!.name as string);
  });

  console.log(`Created ${features.length} features (${usedRealBoundaries} real, ${usedFallback} fallback)\n`);

  // Summary by year
  const byYear = new Map<number, GeoJSON.Feature[]>();
  for (const f of features) {
    const year = f.properties!.year as number;
    const list = byYear.get(year) || [];
    list.push(f);
    byYear.set(year, list);
  }

  console.log('Summary by year:');
  for (const [year, yearFeatures] of Array.from(byYear.entries()).sort((a, b) => a[0] - b[0])) {
    const totalPop = yearFeatures.reduce((sum, f) => sum + (f.properties!.totalPop as number), 0);
    console.log(`  ${year}: ${yearFeatures.length} counties, ${totalPop.toLocaleString()} total pop`);
  }

  // Write output
  await mkdir(OUTPUT_DIR, { recursive: true });

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  const outputPath = join(OUTPUT_DIR, 'counties.geojson');
  await writeFile(outputPath, JSON.stringify(geojson));
  console.log(`\nWrote ${outputPath}`);

  // Write metadata
  const metadata = {
    name: 'Nevada Census Data',
    source: 'NHGIS (IPUMS)',
    years: Array.from(byYear.keys()).sort((a, b) => a - b),
    totalFeatures: features.length,
    variables: ['totalPop', 'popDensity', 'area'],
    generatedAt: new Date().toISOString(),
  };

  const metadataPath = join(OUTPUT_DIR, 'metadata.json');
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`Wrote ${metadataPath}`);

  console.log('\nProcessing complete!');
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
