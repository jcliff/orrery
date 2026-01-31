/**
 * Geocode Storey County assessor addresses to create point-based parcel data.
 *
 * Storey County assessor data has addresses but no coordinates, so we geocode
 * to create point geometry for visualization.
 *
 * Usage: pnpm --filter fieldline geocode:storey-assessor
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const INPUT_PATH = new URL('../../data/raw/storey/assessor.json', import.meta.url).pathname;
const OUTPUT_PATH = new URL('../../data/raw/storey/parcels-geocoded.geojson', import.meta.url).pathname;
const CHECKPOINT_PATH = new URL('../../data/raw/storey/geocode-checkpoint.json', import.meta.url).pathname;

// Use Esri World Geocoder (100% success rate with Douglas)
const GEOCODER_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

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
  // Append county and state for better matching
  const fullAddress = `${address}, Storey County, NV`;

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

// Map property type to land use code (Storey uses same Nevada codes)
function getLandUseCode(propertyType: string): string {
  const type = propertyType.toLowerCase();
  if (type.includes('vacant') || type.includes('land')) return '100';
  if (type.includes('single') || type.includes('residential')) return '200';
  if (type.includes('multi') || type.includes('duplex')) return '210';
  if (type.includes('apartment')) return '220';
  if (type.includes('condo') || type.includes('townhouse')) return '230';
  if (type.includes('mobile')) return '250';
  if (type.includes('commercial') || type.includes('retail')) return '300';
  if (type.includes('office')) return '320';
  if (type.includes('hotel') || type.includes('motel')) return '330';
  if (type.includes('casino') || type.includes('gaming')) return '340';
  if (type.includes('industrial') || type.includes('warehouse')) return '400';
  if (type.includes('agricultural') || type.includes('ranch') || type.includes('farm')) return '600';
  if (type.includes('mining') || type.includes('mine')) return '700';
  if (type.includes('government') || type.includes('public')) return '800';
  return '200'; // Default to residential
}

async function main() {
  console.log('Storey County Assessor Geocoder');
  console.log('===============================\n');

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
      LAND_USE: getLandUseCode(record.propertyType),
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
