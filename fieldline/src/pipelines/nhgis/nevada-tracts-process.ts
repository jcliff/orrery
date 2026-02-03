/**
 * Nevada NHGIS tract processing pipeline.
 *
 * Processes downloaded NHGIS census tract data into visualization-ready GeoJSON.
 * Uses centroid points from the data (INTPTLAT, INTPTLON).
 *
 * Usage:
 *   pnpm --filter fieldline pipeline:nhgis-nevada-tracts
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDensityColor } from './lib/variable-mapping.js';

const INPUT_DIR = new URL('../../data/raw/nhgis/nevada-tracts', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../../chrona/public/data/nhgis-nevada', import.meta.url).pathname;

interface TractRecord {
  gisjoin: string;
  year: number;
  county: string;
  tractName: string;
  totalPop: number;
  areaLand: number;
  lat: number;
  lon: number;
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
        } else if (entry.name.endsWith('_tract.csv')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
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

async function parseCSV(csvPath: string): Promise<TractRecord[]> {
  const content = await readFile(csvPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map(h => h.toUpperCase());
  const records: TractRecord[] = [];

  // Find column indices
  const gisJoinIdx = header.findIndex(h => h === 'GISJOIN');
  const yearIdx = header.findIndex(h => h === 'YEAR');
  const countyIdx = header.findIndex(h => h === 'COUNTY');
  const nameIdx = header.findIndex(h => h === 'NAME' || h === 'BASENAME');
  const areaLandIdx = header.findIndex(h => h === 'AREALAND');
  const latIdx = header.findIndex(h => h === 'INTPTLAT' || h === 'INTPLAT');
  const lonIdx = header.findIndex(h => h === 'INTPTLON' || h === 'INTPLON');

  if (gisJoinIdx === -1) {
    console.warn(`  No GISJOIN column in ${csvPath}`);
    return [];
  }

  // Find NHGIS data columns (end with 3+ digits)
  const dataColumnIndices: number[] = [];
  for (let i = 0; i < header.length; i++) {
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
    const county = countyIdx >= 0 ? values[countyIdx]?.replace(/"/g, '').replace(/ County$/, '') : '';
    const tractName = nameIdx >= 0 ? values[nameIdx]?.replace(/"/g, '') : '';
    const areaLand = areaLandIdx >= 0 ? parseFloat(values[areaLandIdx]) || 0 : 0;

    // Parse coordinates - older data stores as millionths of degrees (integers)
    let lat = latIdx >= 0 ? parseFloat(values[latIdx]) || 0 : 0;
    let lon = lonIdx >= 0 ? parseFloat(values[lonIdx]) || 0 : 0;

    // Convert from millionths of degrees if values are large integers
    if (Math.abs(lat) > 1000) lat = lat / 1000000;
    if (Math.abs(lon) > 1000) lon = lon / 1000000;

    // Get population from first NHGIS data column
    let totalPop = 0;
    if (dataColumnIndices.length > 0) {
      const val = parseInt(values[dataColumnIndices[0]], 10);
      if (!isNaN(val) && val >= 0) {
        totalPop = val;
      }
    }

    if (lat !== 0 && lon !== 0) {
      records.push({ gisjoin, year, county, tractName, totalPop, areaLand, lat, lon });
    }
  }

  return records;
}

async function main() {
  console.log('NHGIS Nevada Tracts Processing Pipeline');
  console.log('========================================\n');

  // Find all tract CSV files
  const csvFiles = await findCSVFiles(INPUT_DIR);
  console.log(`Found ${csvFiles.length} tract CSV files\n`);

  if (csvFiles.length === 0) {
    console.error('Error: No tract CSV files found. Run the extract pipeline first:');
    console.error('  NHGIS_API_KEY=your_key pnpm --filter fieldline pipeline:nhgis-nevada-extract-granular');
    process.exit(1);
  }

  // Parse all CSV files
  console.log('Parsing CSV data...');
  const allRecords: TractRecord[] = [];

  for (const csvFile of csvFiles) {
    const fileName = csvFile.split('/').pop();
    const records = await parseCSV(csvFile);
    if (records.length > 0) {
      console.log(`  ${fileName}: ${records.length} Nevada tracts`);
      allRecords.push(...records);
    }
  }

  console.log(`\nTotal: ${allRecords.length} tract-year records\n`);

  // Create GeoJSON features (points)
  console.log('Creating GeoJSON features...');
  const features: GeoJSON.Feature[] = [];

  for (const record of allRecords) {
    // Area in sq miles (AREALAND is in sq meters)
    const areaSqMiles = record.areaLand / 2589988.11;
    const popDensity = areaSqMiles > 0 ? record.totalPop / areaSqMiles : 0;

    // End time is the next census (10 years later)
    const endYear = record.year + 10;

    features.push({
      type: 'Feature',
      properties: {
        gisjoin: record.gisjoin,
        name: record.tractName,
        county: record.county,
        year: record.year,
        startTime: `${record.year}-01-01T00:00:00Z`,
        endTime: `${endYear}-01-01T00:00:00Z`,
        totalPop: record.totalPop,
        area: Math.round(areaSqMiles * 10) / 10,
        popDensity: Math.round(popDensity * 10) / 10,
        color: getDensityColor(popDensity),
      },
      geometry: {
        type: 'Point',
        coordinates: [record.lon, record.lat],
      },
    });
  }

  // Sort by year, then name
  features.sort((a, b) => {
    const yearDiff = (a.properties!.year as number) - (b.properties!.year as number);
    if (yearDiff !== 0) return yearDiff;
    return (a.properties!.name as string).localeCompare(b.properties!.name as string);
  });

  console.log(`Created ${features.length} tract features\n`);

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
    console.log(`  ${year}: ${yearFeatures.length} tracts, ${totalPop.toLocaleString()} total pop`);
  }

  // Write output
  await mkdir(OUTPUT_DIR, { recursive: true });

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  const outputPath = join(OUTPUT_DIR, 'tracts.geojson');
  await writeFile(outputPath, JSON.stringify(geojson));
  console.log(`\nWrote ${outputPath}`);

  console.log('\nProcessing complete!');
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
