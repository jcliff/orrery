/**
 * Nevada NHGIS processing pipeline.
 *
 * Processes downloaded NHGIS data into visualization-ready GeoJSON.
 * Uses simplified county geometries since we don't have historical shapefiles.
 *
 * Usage:
 *   pnpm --filter fieldline pipeline:nhgis-nevada
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDensityColor } from './lib/variable-mapping.js';

const INPUT_DIR = new URL('../../data/raw/nhgis/nevada', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../../chrona/public/data/nhgis-nevada', import.meta.url).pathname;

// Simplified Nevada county geometries (approximate bounding boxes)
// These are rough approximations for visualization purposes
const NEVADA_COUNTIES: Record<string, { name: string; coords: number[][]; area: number }> = {
  'G3200010': { name: 'Churchill', coords: [[-118.9,40.1],[-117.8,40.1],[-117.8,39.1],[-118.9,39.1],[-118.9,40.1]], area: 5023 },
  'G3200030': { name: 'Clark', coords: [[-115.9,36.9],[-114.0,36.9],[-114.0,35.0],[-115.9,35.0],[-115.9,36.9]], area: 8091 },
  'G3200050': { name: 'Douglas', coords: [[-120.0,39.3],[-119.5,39.3],[-119.5,38.7],[-120.0,38.7],[-120.0,39.3]], area: 710 },
  'G3200070': { name: 'Elko', coords: [[-117.0,42.0],[-114.0,42.0],[-114.0,40.0],[-117.0,40.0],[-117.0,42.0]], area: 17203 },
  'G3200090': { name: 'Esmeralda', coords: [[-118.5,38.2],[-117.2,38.2],[-117.2,37.0],[-118.5,37.0],[-118.5,38.2]], area: 3589 },
  'G3200110': { name: 'Eureka', coords: [[-116.6,40.6],[-115.5,40.6],[-115.5,39.2],[-116.6,39.2],[-116.6,40.6]], area: 4180 },
  'G3200130': { name: 'Humboldt', coords: [[-119.3,42.0],[-117.0,42.0],[-117.0,40.5],[-119.3,40.5],[-119.3,42.0]], area: 9658 },
  'G3200150': { name: 'Lander', coords: [[-117.8,40.6],[-116.6,40.6],[-116.6,39.0],[-117.8,39.0],[-117.8,40.6]], area: 5519 },
  'G3200170': { name: 'Lincoln', coords: [[-115.9,38.7],[-114.0,38.7],[-114.0,36.9],[-115.9,36.9],[-115.9,38.7]], area: 10637 },
  'G3200190': { name: 'Lyon', coords: [[-119.6,39.4],[-118.8,39.4],[-118.8,38.6],[-119.6,38.6],[-119.6,39.4]], area: 2024 },
  'G3200210': { name: 'Mineral', coords: [[-119.0,38.8],[-117.7,38.8],[-117.7,37.9],[-119.0,37.9],[-119.0,38.8]], area: 3813 },
  'G3200230': { name: 'Nye', coords: [[-117.8,39.2],[-115.9,39.2],[-115.9,36.0],[-117.8,36.0],[-117.8,39.2]], area: 18147 },
  'G3200270': { name: 'Pershing', coords: [[-119.3,40.6],[-117.8,40.6],[-117.8,39.8],[-119.3,39.8],[-119.3,40.6]], area: 6037 },
  'G3200290': { name: 'Storey', coords: [[-119.7,39.5],[-119.4,39.5],[-119.4,39.2],[-119.7,39.2],[-119.7,39.5]], area: 264 },
  'G3200310': { name: 'Washoe', coords: [[-120.0,42.0],[-119.2,42.0],[-119.2,39.2],[-120.0,39.2],[-120.0,42.0]], area: 6551 },
  'G3200330': { name: 'White Pine', coords: [[-115.5,40.5],[-114.0,40.5],[-114.0,38.7],[-115.5,38.7],[-115.5,40.5]], area: 8897 },
  'G3205100': { name: 'Carson City', coords: [[-119.85,39.25],[-119.65,39.25],[-119.65,39.05],[-119.85,39.05],[-119.85,39.25]], area: 157 },
  // Historical counties (no longer exist)
  'G3200250': { name: 'Ormsby', coords: [[-119.85,39.25],[-119.65,39.25],[-119.65,39.05],[-119.85,39.05],[-119.85,39.25]], area: 157 },
  'G3200350': { name: 'Bullfrog', coords: [[-117.0,37.5],[-116.5,37.5],[-116.5,37.0],[-117.0,37.0],[-117.0,37.5]], area: 1000 },
  'G3200360': { name: 'Roop', coords: [[-120.0,41.0],[-119.5,41.0],[-119.5,40.5],[-120.0,40.5],[-120.0,41.0]], area: 500 },
  'G3200370': { name: 'Lake', coords: [[-120.0,40.0],[-119.5,40.0],[-119.5,39.5],[-120.0,39.5],[-120.0,40.0]], area: 500 },
  'G3200800': { name: 'Pahute', coords: [[-116.5,37.5],[-116.0,37.5],[-116.0,37.0],[-116.5,37.0],[-116.5,37.5]], area: 500 },
  'G3200850': { name: 'St. Marys', coords: [[-117.0,41.0],[-116.5,41.0],[-116.5,40.5],[-117.0,40.5],[-117.0,41.0]], area: 500 },
};

interface CensusRecord {
  gisjoin: string;
  year: number;
  state: string;
  county: string;
  totalPop: number;
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

  // Find population column (varies by year/dataset)
  // Could be: AV0AA, AZB001, B5O001, etc.
  const popIdx = header.findIndex(h =>
    h.endsWith('001') || // Most modern datasets
    h === 'AV0AA' ||     // 1870-1950 style
    h.match(/^[A-Z]{2,3}\d{3}$/) // Generic pattern
  );

  if (gisJoinIdx === -1) {
    console.warn(`  No GISJOIN column in ${csvPath}`);
    return [];
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

    // Get population - try multiple columns
    let totalPop = 0;
    if (popIdx >= 0 && values[popIdx]) {
      totalPop = parseInt(values[popIdx], 10) || 0;
    }

    // If no pop found, try to find any numeric column after county
    if (totalPop === 0) {
      for (let j = Math.max(countyIdx, stateIdx, yearIdx) + 1; j < values.length; j++) {
        const val = parseInt(values[j], 10);
        if (!isNaN(val) && val > 0) {
          totalPop = val;
          break;
        }
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
  const features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: 'Polygon'; coordinates: number[][][] };
  }> = [];

  for (const record of allRecords) {
    const countyInfo = NEVADA_COUNTIES[record.gisjoin];

    if (!countyInfo) {
      console.warn(`  Unknown county: ${record.gisjoin} (${record.county})`);
      continue;
    }

    const popDensity = countyInfo.area > 0 ? record.totalPop / countyInfo.area : 0;

    features.push({
      type: 'Feature',
      properties: {
        gisjoin: record.gisjoin,
        name: countyInfo.name,
        year: record.year,
        startTime: `${record.year}-01-01T00:00:00Z`,
        totalPop: record.totalPop,
        area: countyInfo.area,
        popDensity: Math.round(popDensity * 10) / 10,
        color: getDensityColor(popDensity),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [countyInfo.coords],
      },
    });
  }

  // Sort by year, then name
  features.sort((a, b) => {
    const yearDiff = (a.properties.year as number) - (b.properties.year as number);
    if (yearDiff !== 0) return yearDiff;
    return (a.properties.name as string).localeCompare(b.properties.name as string);
  });

  console.log(`Created ${features.length} features\n`);

  // Summary by year
  const byYear = new Map<number, typeof features>();
  for (const f of features) {
    const year = f.properties.year as number;
    const list = byYear.get(year) || [];
    list.push(f);
    byYear.set(year, list);
  }

  console.log('Summary by year:');
  for (const [year, yearFeatures] of Array.from(byYear.entries()).sort((a, b) => a[0] - b[0])) {
    const totalPop = yearFeatures.reduce((sum, f) => sum + (f.properties.totalPop as number), 0);
    console.log(`  ${year}: ${yearFeatures.length} counties, ${totalPop.toLocaleString()} total pop`);
  }

  // Write output
  await mkdir(OUTPUT_DIR, { recursive: true });

  const geojson = {
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
  console.log('\nNext step: Generate tiles (optional):');
  console.log('  pnpm --filter fieldline pipeline:nhgis-nevada-tiles');
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
