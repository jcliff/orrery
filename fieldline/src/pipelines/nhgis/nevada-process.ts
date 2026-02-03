/**
 * Nevada NHGIS processing pipeline.
 *
 * Processes downloaded NHGIS data into visualization-ready GeoJSON.
 *
 * Usage:
 *   pnpm --filter fieldline pipeline:nhgis-nevada
 *
 * This script:
 * 1. Reads CSV files with census data
 * 2. Reads shapefiles with county boundaries
 * 3. Joins data with geometries by GISJOIN
 * 4. Outputs combined GeoJSON for all decades
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseCSV,
  parseShapefile,
  joinRecordsWithGeometry,
  type NHGISRecord,
  type NHGISFeature,
} from './lib/nhgis-parser.js';
import { getDensityColor, getCensusYears } from './lib/variable-mapping.js';

const INPUT_DIR = new URL('../../data/raw/nhgis/nevada', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/nhgis-nevada', import.meta.url).pathname;

async function findFiles(dir: string, extension: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.endsWith(extension)) {
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

async function main() {
  console.log('NHGIS Nevada Processing Pipeline');
  console.log('=================================\n');

  // Find all CSV and shapefile files
  const csvFiles = await findFiles(INPUT_DIR, '.csv');
  const shpFiles = await findFiles(INPUT_DIR, '.shp');

  console.log(`Found ${csvFiles.length} CSV files`);
  console.log(`Found ${shpFiles.length} shapefiles\n`);

  if (csvFiles.length === 0 || shpFiles.length === 0) {
    console.error('Error: No data files found. Run the extract pipeline first:');
    console.error('  NHGIS_API_KEY=your_key pnpm --filter fieldline pipeline:nhgis-nevada-extract');
    process.exit(1);
  }

  // Parse all CSV files
  console.log('Parsing CSV data...');
  const allRecords = new Map<string, NHGISRecord>();

  for (const csvFile of csvFiles) {
    // Skip codebook and other non-data files
    if (csvFile.includes('codebook') || csvFile.includes('readme')) continue;

    console.log(`  ${csvFile.split('/').pop()}`);
    const records = await parseCSV(csvFile);

    for (const [_, record] of records) {
      // Key by gisjoin + year for unique identification
      const key = `${record.gisjoin}_${record.year}`;
      allRecords.set(key, record);
    }
  }

  console.log(`\nLoaded ${allRecords.size} county-year records\n`);

  // Parse shapefiles by year
  console.log('Parsing shapefiles...');
  const geometriesByYear = new Map<number, Map<string, { geometry: GeoJSON.Geometry; areaLand: number }>>();

  for (const shpFile of shpFiles) {
    // Extract year from filename
    const yearMatch = shpFile.match(/(\d{4})/);
    if (!yearMatch) continue;

    const year = parseInt(yearMatch[1], 10);
    console.log(`  ${shpFile.split('/').pop()} (${year})`);

    const geometries = await parseShapefile(shpFile);
    geometriesByYear.set(year, geometries);
    console.log(`    ${geometries.size} Nevada counties`);
  }

  console.log(`\nLoaded geometries for ${geometriesByYear.size} years\n`);

  // Join records with geometries
  console.log('Joining data with geometries...');
  const allFeatures: NHGISFeature[] = [];

  for (const [key, record] of allRecords) {
    // Find the appropriate geometry for this year
    let geometries = geometriesByYear.get(record.year);

    // Fall back to closest available year if exact match not found
    if (!geometries) {
      const availableYears = Array.from(geometriesByYear.keys()).sort((a, b) => a - b);
      const closestYear = availableYears.reduce((prev, curr) =>
        Math.abs(curr - record.year) < Math.abs(prev - record.year) ? curr : prev
      );
      geometries = geometriesByYear.get(closestYear);
      if (geometries) {
        console.log(`  Using ${closestYear} geometry for ${record.year} data`);
      }
    }

    if (!geometries) {
      console.warn(`  No geometry available for ${record.year}`);
      continue;
    }

    const geo = geometries.get(record.gisjoin);
    if (!geo) {
      console.warn(`  No geometry for ${record.gisjoin} (${record.name}) in ${record.year}`);
      continue;
    }

    // Calculate area and density
    const areaSqMiles = geo.areaLand > 0 ? geo.areaLand / 2589988.11 : 0;
    const popDensity = areaSqMiles > 0 ? record.totalPop / areaSqMiles : 0;

    allFeatures.push({
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

  // Sort by year, then by name
  allFeatures.sort((a, b) => {
    if (a.properties.year !== b.properties.year) {
      return a.properties.year - b.properties.year;
    }
    return a.properties.name.localeCompare(b.properties.name);
  });

  console.log(`\nCreated ${allFeatures.length} features\n`);

  // Print summary by year
  const byYear = new Map<number, NHGISFeature[]>();
  for (const f of allFeatures) {
    const year = f.properties.year;
    const list = byYear.get(year) || [];
    list.push(f);
    byYear.set(year, list);
  }

  console.log('Summary by year:');
  for (const [year, features] of Array.from(byYear.entries()).sort((a, b) => a[0] - b[0])) {
    const totalPop = features.reduce((sum, f) => sum + f.properties.totalPop, 0);
    console.log(`  ${year}: ${features.length} counties, ${totalPop.toLocaleString()} total pop`);
  }

  // Write output
  await mkdir(OUTPUT_DIR, { recursive: true });

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  };

  const outputPath = join(OUTPUT_DIR, 'counties.geojson');
  await writeFile(outputPath, JSON.stringify(geojson));
  console.log(`\nWrote ${outputPath}`);

  // Write metadata
  const metadata = {
    name: 'Nevada Census Data',
    source: 'NHGIS (IPUMS)',
    years: Array.from(byYear.keys()).sort((a, b) => a - b),
    totalFeatures: allFeatures.length,
    variables: ['totalPop', 'housingUnits', 'popDensity', 'area'],
    generatedAt: new Date().toISOString(),
  };

  const metadataPath = join(OUTPUT_DIR, 'metadata.json');
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`Wrote ${metadataPath}`);

  console.log('\nProcessing complete!');
  console.log('\nNext step: Generate tiles:');
  console.log('  pnpm --filter fieldline pipeline:nhgis-nevada-tiles');
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
