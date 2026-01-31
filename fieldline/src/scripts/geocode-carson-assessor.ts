/**
 * Geocode Carson City assessor addresses to create point-based parcel data.
 *
 * Since Carson City GIS uses a different APN system (12-digit township/range)
 * than the assessor (8-digit book/block/lot), we geocode addresses instead.
 *
 * Usage: pnpm --filter fieldline geocode:carson-assessor
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const INPUT_PATH = new URL('../../data/raw/carson-city/assessor.json', import.meta.url).pathname;
const OUTPUT_PATH = new URL('../../data/raw/carson-city/parcels-geocoded.geojson', import.meta.url).pathname;
const CHECKPOINT_PATH = new URL('../../data/raw/carson-city/geocode-checkpoint.json', import.meta.url).pathname;

// Carson City geocoder endpoint
const GEOCODER_URL = 'https://gis.carson.org/arcgis/rest/services/CarsonCity/CarsonCityNV_Address_Locator/GeocodeServer/findAddressCandidates';

interface AssessorRecord {
  apn: string;
  yearBuilt: number;
  address: string;
  propertyType: string;
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
  // Use Street parameter (not SingleLine) for Carson City geocoder
  const params = new URLSearchParams({
    Street: address,
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
      if (best.score >= 80) { // Only accept high-confidence matches
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

async function main() {
  console.log('Carson City Assessor Geocoder');
  console.log('=============================\n');

  // Load assessor data
  const content = await readFile(INPUT_PATH, 'utf-8');
  const assessorData = JSON.parse(content) as AssessorRecord[];
  console.log(`Loaded ${assessorData.length} assessor records`);

  // Filter to records with addresses
  const withAddress = assessorData.filter(r => r.address && r.address.trim().length > 0);
  console.log(`Records with addresses: ${withAddress.length}`);

  // Load checkpoint
  const checkpoint = await loadCheckpoint();
  const geocoded: GeocodedRecord[] = checkpoint?.geocoded || [];
  const failed: string[] = checkpoint?.failed || [];
  const startIndex = checkpoint?.lastIndex || 0;
  const seenApns = new Set(geocoded.map(g => g.apn));

  console.log(checkpoint
    ? `Resuming from index ${startIndex}, ${geocoded.length} already geocoded`
    : 'Starting fresh');

  // Geocode addresses
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

    // Progress update
    if ((i + 1) % 100 === 0) {
      console.log(`  Processed ${i + 1}/${withAddress.length} (${geocoded.length} geocoded, ${failed.length} failed)`);

      // Save checkpoint
      await saveCheckpoint({
        geocoded,
        lastIndex: i + 1,
        failed,
      });
    }

    // Rate limit (be nice to the geocoder)
    await sleep(50);
  }

  // Final checkpoint
  await saveCheckpoint({
    geocoded,
    lastIndex: withAddress.length,
    failed,
  });

  console.log(`\nGeocoding complete:`);
  console.log(`  Geocoded: ${geocoded.length}`);
  console.log(`  Failed: ${failed.length}`);

  // Write GeoJSON output
  const features: GeoJSON.Feature[] = geocoded.map(record => ({
    type: 'Feature',
    properties: {
      APN: record.apn,
      YEARBLT: record.yearBuilt,
      FullAddress: record.address,
      LAND_USE: record.propertyType === 'Parcel' ? '200' : '300', // Default to residential
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
