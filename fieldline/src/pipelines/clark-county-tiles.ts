import { createReadStream, createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const INPUT_DIR = new URL('../../data/raw/clark-county', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/clark-county', import.meta.url).pathname;

const POLYGON_INPUT = `${INPUT_DIR}/parcel-polygons.geojson`;
const POLYGON_OUTPUT = `${OUTPUT_DIR}/parcels-detailed.geojson`;
const PMTILES_OUTPUT = `${OUTPUT_DIR}/parcels.pmtiles`;

// Land use colors
const USE_COLORS: Record<string, string> = {
  'Residential': '#3498db',
  'Commercial': '#e74c3c',
  'Industrial': '#7f8c8d',
  'Vacant': '#f39c12',
  'Government': '#27ae60',
  'Other': '#95a5a6',
};

function getUseCategory(parcelType: number, labelClass: number): string {
  if (labelClass >= 700 && labelClass < 800) return 'Residential';
  if (labelClass >= 800 && labelClass < 900) return 'Commercial';
  if (labelClass >= 900) return 'Industrial';
  if (parcelType === 0) return 'Residential';
  if (parcelType === 1) return 'Commercial';
  if (parcelType === 2) return 'Industrial';
  return 'Other';
}

// Distance-based year imputation
const DOWNTOWN_CENTER: [number, number] = [-115.1398, 36.1699];
const STRIP_CENTER: [number, number] = [-115.1728, 36.1147];

function haversineDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371;
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function imputeYearFromDistance(coords: [number, number]): number {
  const distFromDowntown = haversineDistance(coords, DOWNTOWN_CENTER);
  const distFromStrip = haversineDistance(coords, STRIP_CENTER);
  const minDist = Math.min(distFromDowntown, distFromStrip);

  if (minDist < 2) return 1950 + Math.floor(Math.random() * 20);
  if (minDist < 5) return 1960 + Math.floor(Math.random() * 20);
  if (minDist < 15) return 1970 + Math.floor(Math.random() * 30);
  if (minDist < 30) return 1990 + Math.floor(Math.random() * 25);
  return 2000 + Math.floor(Math.random() * 20);
}

function getCentroid(geometry: any): [number, number] {
  let coords: number[][][];
  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates;
  } else {
    coords = geometry.coordinates[0];
  }
  const ring = coords[0];
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / ring.length, sumLat / ring.length];
}

// Extract features from a buffer - find complete {"type":"Feature"...} objects
function extractFeatures(buffer: string): { features: string[]; remaining: string } {
  const features: string[] = [];
  let pos = 0;

  while (pos < buffer.length) {
    // Find start of feature
    const featureStart = buffer.indexOf('{"type":"Feature"', pos);
    if (featureStart === -1) break;

    // Find matching closing brace by counting braces
    let depth = 0;
    let inString = false;
    let escaped = false;
    let featureEnd = -1;

    for (let i = featureStart; i < buffer.length; i++) {
      const char = buffer[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          featureEnd = i + 1;
          break;
        }
      }
    }

    if (featureEnd === -1) {
      // Incomplete feature - return rest as remaining
      return { features, remaining: buffer.slice(featureStart) };
    }

    features.push(buffer.slice(featureStart, featureEnd));
    pos = featureEnd;
  }

  // Find the last potential feature start for remaining
  const lastFeatureStart = buffer.lastIndexOf('{"type":"Feature"', buffer.length - 1);
  if (lastFeatureStart > pos) {
    return { features, remaining: buffer.slice(lastFeatureStart) };
  }

  return { features, remaining: '' };
}

async function main() {
  console.log('Processing Clark County polygons for PMTiles...\n');

  // Load parcels and subdivisions to rebuild the date lookup
  console.log('Loading parcel points for date lookup...');
  const parcelsRaw = JSON.parse(await readFile(`${INPUT_DIR}/parcels.geojson`, 'utf-8'));
  const subdivisionsRaw = JSON.parse(await readFile(`${INPUT_DIR}/subdivisions.geojson`, 'utf-8'));
  const addedRaw = JSON.parse(await readFile(`${INPUT_DIR}/added-parcels.geojson`, 'utf-8'));

  // Build added lookup
  const addedLookup = new Map<string, number>();
  for (const added of addedRaw.features) {
    if (added.properties.apn && added.properties.add_dt) {
      const year = new Date(added.properties.add_dt).getFullYear();
      if (year >= 2000 && year <= 2030) {
        addedLookup.set(added.properties.apn, year);
      }
    }
  }
  console.log(`  Added lookup: ${addedLookup.size} APNs`);

  // Parse subdivision dates
  function parseDocNumYear(docNum: string | null): number | null {
    if (!docNum) return null;
    const match = docNum.match(/^(19\d{2}|20\d{2})(\d{2})(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (year >= 1900 && year <= 2030 && month >= 1 && month <= 12) return year;
    }
    return null;
  }

  function estimateYearFromMapBook(mapBook: string | null): number | null {
    if (!mapBook || mapBook === 'PB') return null;
    const bookNum = parseInt(mapBook, 10);
    if (isNaN(bookNum) || bookNum < 1) return null;
    return Math.max(1956, Math.min(2025, Math.round(1956 + (bookNum - 1) * 0.394)));
  }

  interface SubWithDate {
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    geometry: any;
    year: number;
    source: string;
  }

  const subsWithDates: SubWithDate[] = [];
  for (const sub of subdivisionsRaw.features) {
    if (!sub.geometry) continue;

    // Compute bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const processRing = (ring: number[][]) => {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    };
    if (sub.geometry.type === 'Polygon') {
      processRing(sub.geometry.coordinates[0]);
    } else {
      for (const poly of sub.geometry.coordinates) processRing(poly[0]);
    }

    let year = parseDocNumYear(sub.properties.Doc_Num);
    let source = 'subdivision';
    if (!year) {
      year = estimateYearFromMapBook(sub.properties.Map_Book);
      source = 'mapbook';
    }
    if (year) {
      subsWithDates.push({ bbox: { minX, minY, maxX, maxY }, geometry: sub.geometry, year, source });
    }
  }
  console.log(`  Subdivisions with dates: ${subsWithDates.length}`);

  // Point in polygon check
  function pointInPolygon(point: [number, number], polygon: number[][][]): boolean {
    const [x, y] = point;
    const ring = polygon[0];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInMultiPolygon(point: [number, number], multiPolygon: number[][][][]): boolean {
    for (const polygon of multiPolygon) {
      if (pointInPolygon(point, polygon)) return true;
    }
    return false;
  }

  // Build APN -> date lookup from parcels
  console.log('Building APN date lookup from parcels...');
  const apnDateLookup = new Map<string, { year: number; use: string; estimated: boolean }>();

  for (const parcel of parcelsRaw.features) {
    if (!parcel.geometry || !parcel.properties.APN) continue;

    const apn = parcel.properties.APN;
    const coords = parcel.geometry.coordinates as [number, number];
    const use = getUseCategory(parcel.properties.PARCELTYPE, parcel.properties.Label_Class);

    let year: number;
    let estimated = false;

    const addedYear = addedLookup.get(apn);
    if (addedYear) {
      year = addedYear;
    } else {
      let found = false;
      for (const sub of subsWithDates) {
        if (coords[0] < sub.bbox.minX || coords[0] > sub.bbox.maxX ||
            coords[1] < sub.bbox.minY || coords[1] > sub.bbox.maxY) continue;

        const inSub = sub.geometry.type === 'Polygon'
          ? pointInPolygon(coords, sub.geometry.coordinates)
          : pointInMultiPolygon(coords, sub.geometry.coordinates);

        if (inSub) {
          year = sub.year;
          estimated = sub.source === 'mapbook';
          found = true;
          break;
        }
      }
      if (!found) {
        year = imputeYearFromDistance(coords);
        estimated = true;
      }
    }

    apnDateLookup.set(apn, { year: year!, use, estimated });
  }
  console.log(`  APN date lookup: ${apnDateLookup.size} entries`);

  // Now stream process the polygon file using chunks
  console.log('\nStreaming polygon processing (chunk-based)...');

  const output = createWriteStream(POLYGON_OUTPUT);
  output.write('{"type":"FeatureCollection","features":[');

  let buffer = '';
  let featureCount = 0;
  let isFirst = true;
  const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB chunks

  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(POLYGON_INPUT, {
      encoding: 'utf-8',
      highWaterMark: CHUNK_SIZE,
    });

    input.on('data', (chunk: string | Buffer) => {
      buffer += chunk.toString();

      const { features, remaining } = extractFeatures(buffer);
      buffer = remaining;

      for (const featureStr of features) {
        try {
          const feature = JSON.parse(featureStr);

          if (feature.properties && feature.geometry) {
            const apn = feature.properties.APN;
            const dateInfo = apnDateLookup.get(apn);

            let year: number;
            let use: string;
            let estimated: boolean;

            if (dateInfo) {
              year = dateInfo.year;
              use = dateInfo.use;
              estimated = dateInfo.estimated;
            } else {
              const centroid = getCentroid(feature.geometry);
              year = imputeYearFromDistance(centroid);
              use = getUseCategory(feature.properties.PARCELTYPE || 0, feature.properties.Label_Class || 700);
              estimated = true;
            }

            const newFeature = {
              type: 'Feature',
              properties: {
                y: year,
                u: use,
                e: estimated ? 1 : 0,
                startTime: `${year}-01-01T00:00:00Z`,
                color: USE_COLORS[use] || '#95a5a6',
              },
              geometry: feature.geometry,
            };

            if (!isFirst) output.write(',');
            output.write(JSON.stringify(newFeature));
            isFirst = false;
            featureCount++;

            if (featureCount % 50000 === 0) {
              console.log(`  Processed ${featureCount.toLocaleString()} polygons...`);
            }
          }
        } catch (e) {
          // Skip malformed features
        }
      }
    });

    input.on('end', () => {
      output.write(']}');
      output.end();
      resolve();
    });

    input.on('error', reject);
  });

  console.log(`\nWrote ${POLYGON_OUTPUT} (${featureCount.toLocaleString()} polygons)`);

  // Convert to PMTiles
  console.log('\nConverting to PMTiles...');
  const cmd = `tippecanoe -o ${PMTILES_OUTPUT} -Z10 -z16 -l parcels --drop-densest-as-needed --extend-zooms-if-still-dropping --force ${POLYGON_OUTPUT}`;
  console.log(`Running: ${cmd}\n`);

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log('\nDone! PMTiles created.');
  } catch (err) {
    console.error('tippecanoe failed');
    process.exit(1);
  }
}

main().catch(console.error);
