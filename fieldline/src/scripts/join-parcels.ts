/**
 * Join parcel geometries with assessor data.
 *
 * This utility joins parcel GeoJSON (with geometry + APN) to assessor data
 * (with APN + year built + land use) on the APN field.
 *
 * Usage:
 *   pnpm --filter fieldline join:parcels -- \
 *     --parcels data/raw/carson-city/parcels.geojson \
 *     --assessor data/raw/carson-city/assessor.json \
 *     --output data/raw/carson-city/parcels-joined.geojson \
 *     --apn-field APN \
 *     --assessor-apn apn
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

interface AssessorRecord {
  apn: string;
  yearBuilt: number | null;
  address?: string;
  landUse?: string;
  sqft?: number | null;
  acres?: number | null;
  owner?: string;
  city?: string;
  [key: string]: unknown;
}

interface CliArgs {
  parcels: string;
  assessor: string;
  output: string;
  apnField: string;
  assessorApn: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: Partial<CliArgs> = {
    apnField: 'APN', // default parcel APN field
    assessorApn: 'apn', // default assessor APN field
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--parcels':
        result.parcels = args[++i];
        break;
      case '--assessor':
        result.assessor = args[++i];
        break;
      case '--output':
        result.output = args[++i];
        break;
      case '--apn-field':
        result.apnField = args[++i];
        break;
      case '--assessor-apn':
        result.assessorApn = args[++i];
        break;
    }
  }

  if (!result.parcels || !result.assessor || !result.output) {
    console.error('Usage: join-parcels --parcels <file> --assessor <file> --output <file>');
    console.error('Options:');
    console.error('  --parcels      Path to parcel GeoJSON with geometries');
    console.error('  --assessor     Path to assessor JSON with year built data');
    console.error('  --output       Path to output joined GeoJSON');
    console.error('  --apn-field    APN field name in parcel GeoJSON (default: APN)');
    console.error('  --assessor-apn APN field name in assessor JSON (default: apn)');
    process.exit(1);
  }

  return result as CliArgs;
}

/**
 * Normalize APN for matching (remove dashes, spaces, leading zeros)
 */
function normalizeApn(apn: string | number | null | undefined): string {
  if (apn === null || apn === undefined) return '';
  const str = String(apn).trim();
  // Remove common separators and normalize
  return str.replace(/[-\s.]/g, '').replace(/^0+/, '');
}

async function main() {
  const args = parseArgs();

  console.log('Parcel + Assessor Join Utility');
  console.log('==============================\n');

  // Resolve paths relative to cwd
  const parcelPath = args.parcels.startsWith('/') ? args.parcels : `${process.cwd()}/${args.parcels}`;
  const assessorPath = args.assessor.startsWith('/') ? args.assessor : `${process.cwd()}/${args.assessor}`;
  const outputPath = args.output.startsWith('/') ? args.output : `${process.cwd()}/${args.output}`;

  console.log(`Parcel file: ${parcelPath}`);
  console.log(`Assessor file: ${assessorPath}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Parcel APN field: ${args.apnField}`);
  console.log(`Assessor APN field: ${args.assessorApn}\n`);

  // Load parcel GeoJSON
  console.log('Loading parcel GeoJSON...');
  const parcelContent = await readFile(parcelPath, 'utf-8');
  const parcelData = JSON.parse(parcelContent) as GeoJSON.FeatureCollection;
  console.log(`  Loaded ${parcelData.features.length} parcels`);

  // Load assessor data
  console.log('Loading assessor data...');
  const assessorContent = await readFile(assessorPath, 'utf-8');
  const assessorData = JSON.parse(assessorContent) as AssessorRecord[];
  console.log(`  Loaded ${assessorData.length} assessor records`);

  // Build assessor lookup by normalized APN
  console.log('\nBuilding assessor lookup...');
  const assessorLookup = new Map<string, AssessorRecord>();
  for (const record of assessorData) {
    const apn = normalizeApn(record[args.assessorApn] as string);
    if (apn) {
      assessorLookup.set(apn, record);
    }
  }
  console.log(`  Indexed ${assessorLookup.size} unique APNs`);

  // Join parcel geometries with assessor data
  console.log('\nJoining parcels with assessor data...');
  let matched = 0;
  let unmatched = 0;
  let withYear = 0;

  const joinedFeatures: GeoJSON.Feature[] = [];

  for (const feature of parcelData.features) {
    const props = feature.properties || {};
    const parcelApn = normalizeApn(props[args.apnField]);

    if (!parcelApn) {
      unmatched++;
      continue;
    }

    const assessorRecord = assessorLookup.get(parcelApn);

    if (assessorRecord) {
      matched++;
      if (assessorRecord.yearBuilt !== null) withYear++;

      // Merge properties
      joinedFeatures.push({
        type: 'Feature',
        properties: {
          // Keep original parcel properties
          ...props,
          // Add assessor data
          APN: parcelApn,
          YEARBLT: assessorRecord.yearBuilt,
          LAND_USE: assessorRecord.landUse || props.LAND_USE || '',
          FullAddress: assessorRecord.address || props.FullAddress || props.Address || '',
          SQFEET: assessorRecord.sqft || props.SQFEET || null,
          ACREAGE: assessorRecord.acres || props.ACREAGE || null,
          CITY: assessorRecord.city || props.CITY || '',
        },
        geometry: feature.geometry,
      });
    } else {
      unmatched++;
      // Still include unmatched parcels (will have null year built)
      joinedFeatures.push({
        type: 'Feature',
        properties: {
          ...props,
          APN: parcelApn,
          YEARBLT: null,
        },
        geometry: feature.geometry,
      });
    }
  }

  console.log(`  Matched: ${matched} (${((matched / parcelData.features.length) * 100).toFixed(1)}%)`);
  console.log(`  Unmatched: ${unmatched}`);
  console.log(`  With year built: ${withYear}`);

  // Write output
  console.log('\nWriting output...');
  await mkdir(dirname(outputPath), { recursive: true });

  const output: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: joinedFeatures,
  };
  await writeFile(outputPath, JSON.stringify(output));
  console.log(`  Wrote ${outputPath} (${joinedFeatures.length} features)`);

  // Year distribution summary
  const years = joinedFeatures
    .map(f => f.properties?.YEARBLT as number)
    .filter(y => y !== null && y >= 1800 && y <= 2030);

  if (years.length > 0) {
    years.sort((a, b) => a - b);
    const minYear = years[0];
    const maxYear = years[years.length - 1];
    const medianYear = years[Math.floor(years.length / 2)];

    console.log(`\nYear distribution:`);
    console.log(`  Range: ${minYear} - ${maxYear}`);
    console.log(`  Median: ${medianYear}`);
  }
}

main().catch(console.error);
