/**
 * Generic county geocoder for Nevada assessor data.
 *
 * Usage: node --import tsx src/scripts/geocode-county.ts <county>
 * Example: node --import tsx src/scripts/geocode-county.ts churchill
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const COUNTY = process.argv[2];
if (!COUNTY) {
  console.error('Usage: geocode-county.ts <county>');
  console.error('Counties: churchill, pershing, nye, mineral, humboldt, eureka, elko, lander, lincoln, storey');
  process.exit(1);
}

const COUNTY_NAMES: Record<string, string> = {
  churchill: 'Churchill County',
  pershing: 'Pershing County',
  nye: 'Nye County',
  mineral: 'Mineral County',
  humboldt: 'Humboldt County',
  eureka: 'Eureka County',
  elko: 'Elko County',
  lander: 'Lander County',
  lincoln: 'Lincoln County',
  storey: 'Storey County',
};

const COUNTY_NAME = COUNTY_NAMES[COUNTY] || `${COUNTY.charAt(0).toUpperCase() + COUNTY.slice(1)} County`;

const INPUT_PATH = new URL(`../../data/raw/${COUNTY}/assessor.json`, import.meta.url).pathname;
const OUTPUT_PATH = new URL(`../../data/raw/${COUNTY}/parcels-geocoded.geojson`, import.meta.url).pathname;
const CHECKPOINT_PATH = new URL(`../../data/raw/${COUNTY}/geocode-checkpoint.json`, import.meta.url).pathname;

const GEOCODER_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

interface AssessorRecord {
  apn: string;
  yearBuilt: number;
  address: string;
  propertyType: string;
  propertyTypeCode?: string;
  ownerName: string;
}

interface GeocodedRecord extends AssessorRecord {
  lng: number;
  lat: number;
  score: number;
}

interface CheckpointData {
  geocoded: GeocodedRecord[];
  lastIndex: number;
  failed: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeAddress(address: string): Promise<{ lng: number; lat: number; score: number } | null> {
  const fullAddress = `${address}, ${COUNTY_NAME}, NV`;

  const params = new URLSearchParams({
    SingleLine: fullAddress,
    f: 'json',
    outSR: '4326',
    maxLocations: '1',
  });

  try {
    const response = await fetch(`${GEOCODER_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json() as {
      candidates?: Array<{
        location: { x: number; y: number };
        score: number;
      }>;
    };

    if (data.candidates && data.candidates.length > 0) {
      const best = data.candidates[0];
      if (best.score >= 80) {
        return {
          lng: best.location.x,
          lat: best.location.y,
          score: best.score,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function loadCheckpoint(): Promise<CheckpointData | null> {
  try {
    if (existsSync(CHECKPOINT_PATH)) {
      const content = await readFile(CHECKPOINT_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    console.log('No valid checkpoint found');
  }
  return null;
}

async function saveCheckpoint(data: CheckpointData): Promise<void> {
  await writeFile(CHECKPOINT_PATH, JSON.stringify(data, null, 2));
}

function getLandUseCode(typeCode: string | undefined): string {
  if (!typeCode) return '200';

  const code = typeCode.charAt(0);
  const mapping: Record<string, string> = {
    '1': '100', // Vacant
    '2': '200', // Residential
    '3': '300', // Commercial
    '4': '400', // Industrial
    '5': '500', // Industrial
    '6': '600', // Agricultural
    '7': '700', // Mining
    '8': '800', // Government
  };
  return mapping[code] || '200';
}

async function main() {
  console.log(`${COUNTY_NAME} Geocoder`);
  console.log('='.repeat(40) + '\n');

  if (!existsSync(INPUT_PATH)) {
    console.error(`Input file not found: ${INPUT_PATH}`);
    console.error('Run the assessor scraper first.');
    process.exit(1);
  }

  const content = await readFile(INPUT_PATH, 'utf-8');
  const assessorData = JSON.parse(content) as AssessorRecord[];
  console.log(`Loaded ${assessorData.length} assessor records`);

  const withAddress = assessorData.filter(r => r.address && r.address.trim().length > 0);
  console.log(`Records with addresses: ${withAddress.length}`);

  const checkpoint = await loadCheckpoint();
  const geocoded: GeocodedRecord[] = checkpoint?.geocoded || [];
  const failed: string[] = checkpoint?.failed || [];
  const startIndex = checkpoint?.lastIndex || 0;
  const seenApns = new Set(geocoded.map(g => g.apn));

  console.log(checkpoint
    ? `Resuming from index ${startIndex}, ${geocoded.length} already geocoded`
    : 'Starting fresh');

  for (let i = startIndex; i < withAddress.length; i++) {
    const record = withAddress[i];

    if (seenApns.has(record.apn)) continue;

    const result = await geocodeAddress(record.address);

    if (result) {
      geocoded.push({
        ...record,
        lng: result.lng,
        lat: result.lat,
        score: result.score,
      });
      seenApns.add(record.apn);
    } else {
      failed.push(record.apn);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  Processed ${i + 1}/${withAddress.length} (${geocoded.length} geocoded, ${failed.length} failed)`);
      await saveCheckpoint({ geocoded, lastIndex: i + 1, failed });
    }

    await sleep(50);
  }

  await saveCheckpoint({ geocoded, lastIndex: withAddress.length, failed });

  console.log(`\nGeocoding complete:`);
  console.log(`  Geocoded: ${geocoded.length}`);
  console.log(`  Failed: ${failed.length}`);

  const features: GeoJSON.Feature[] = geocoded.map(record => ({
    type: 'Feature',
    properties: {
      APN: record.apn,
      YEARBLT: record.yearBuilt,
      FullAddress: record.address,
      LAND_USE: getLandUseCode(record.propertyTypeCode),
      SQFEET: null,
      ACREAGE: null,
    },
    geometry: {
      type: 'Point',
      coordinates: [record.lng, record.lat],
    },
  }));

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(geojson));
  console.log(`\nWrote ${OUTPUT_PATH} (${features.length} features)`);
}

main().catch(console.error);
