import { readFile, writeFile, mkdir } from 'node:fs/promises';

const INPUT_DIR = new URL('../../data/raw/clark-county', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/clark-county', import.meta.url).pathname;

// Las Vegas Strip center (used for distance-based imputation)
const STRIP_CENTER: [number, number] = [-115.1728, 36.1147];
const DOWNTOWN_CENTER: [number, number] = [-115.1398, 36.1699];

// Grid size for clustering (in degrees, ~330m for aggressive clustering)
const GRID_SIZE = 0.003;

interface RawParcel {
  type: 'Feature';
  properties: {
    APN: string;
    PARCELTYPE: number;
    TAX_DIST: string;
    CALC_ACRES: number | null;
    ASSR_ACRES: number | null;
    Label_Class: number;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

interface RawParcelPolygon {
  type: 'Feature';
  properties: {
    APN: string;
    PARCELTYPE: number;
    Label_Class: number;
    ASSR_ACRES: number | null;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface RawSubdivision {
  type: 'Feature';
  properties: {
    SubName: string | null;
    Doc_Num: string | null;
    Map_Book: string | null;
    Map_Page: string | null;
    Map_Type: number | null;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  } | null;
}

interface AddedParcel {
  type: 'Feature';
  properties: {
    apn: string;
    add_dt: number | null;
    src_yr: number | null;
    str_num: number | null;
    str: string | null;
    str_sfx: string | null;
    city: string | null;
    zip: string | null;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

// Parse date from Doc_Num format (e.g., "2016072000954" -> 2016)
function parseDocNumYear(docNum: string | null): number | null {
  if (!docNum) return null;

  // Format: YYYYMMDDXXXXX (13+ digits starting with year)
  const match = docNum.match(/^(19\d{2}|20\d{2})(\d{2})(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (year >= 1900 && year <= 2030 && month >= 1 && month <= 12) {
      return year;
    }
  }

  return null;
}

// Parse Map_Book to estimate year (Book 1 ≈ 1956, Book 176 ≈ 2025)
function estimateYearFromMapBook(mapBook: string | null): number | null {
  if (!mapBook || mapBook === 'PB') return null;

  const bookNum = parseInt(mapBook, 10);
  if (isNaN(bookNum) || bookNum < 1) return null;

  // Linear interpolation: Book 1 = 1956, Book 176 = 2025
  // (2025 - 1956) / (176 - 1) = 69 / 175 ≈ 0.394 years per book
  const year = Math.round(1956 + (bookNum - 1) * 0.394);
  return Math.max(1956, Math.min(2025, year));
}

// Distance in km between two points
function haversineDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371; // Earth radius in km
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Impute year based on distance from downtown (closer = older)
function imputeYearFromDistance(coords: [number, number]): number {
  const distFromDowntown = haversineDistance(coords, DOWNTOWN_CENTER);
  const distFromStrip = haversineDistance(coords, STRIP_CENTER);
  const minDist = Math.min(distFromDowntown, distFromStrip);

  // Downtown core (< 2km): 1950-1970
  // Inner ring (2-5km): 1960-1980
  // Middle ring (5-15km): 1970-2000
  // Outer suburbs (15-30km): 1990-2015
  // Exurbs (> 30km): 2000-2020

  if (minDist < 2) {
    return 1950 + Math.floor(Math.random() * 20);
  } else if (minDist < 5) {
    return 1960 + Math.floor(Math.random() * 20);
  } else if (minDist < 15) {
    return 1970 + Math.floor(Math.random() * 30);
  } else if (minDist < 30) {
    return 1990 + Math.floor(Math.random() * 25);
  } else {
    return 2000 + Math.floor(Math.random() * 20);
  }
}

// Bounding box for quick rejection
interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function getBoundingBox(geometry: RawSubdivision['geometry']): BBox | null {
  if (!geometry) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const processRing = (ring: number[][]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };

  if (geometry.type === 'Polygon') {
    processRing((geometry.coordinates as number[][][])[0]);
  } else {
    for (const polygon of geometry.coordinates as number[][][][]) {
      processRing(polygon[0]);
    }
  }

  return { minX, minY, maxX, maxY };
}

function pointInBBox(point: [number, number], bbox: BBox): boolean {
  return point[0] >= bbox.minX && point[0] <= bbox.maxX &&
         point[1] >= bbox.minY && point[1] <= bbox.maxY;
}

// Check if point is inside polygon (ray casting)
function pointInPolygon(point: [number, number], polygon: number[][][]): boolean {
  const [x, y] = point;
  const ring = polygon[0]; // exterior ring

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
    if (pointInPolygon(point, polygon)) {
      return true;
    }
  }
  return false;
}

// Land use colors based on parcel type
const USE_COLORS: Record<string, string> = {
  'Residential': '#3498db',
  'Commercial': '#e74c3c',
  'Industrial': '#7f8c8d',
  'Vacant': '#f39c12',
  'Government': '#27ae60',
  'Other': '#95a5a6',
};

function getUseCategory(parcelType: number, labelClass: number): string {
  // Label_Class codes from Clark County
  // 700s = Residential, 800s = Commercial, etc.
  if (labelClass >= 700 && labelClass < 800) return 'Residential';
  if (labelClass >= 800 && labelClass < 900) return 'Commercial';
  if (labelClass >= 900) return 'Industrial';
  if (parcelType === 0) return 'Residential';
  if (parcelType === 1) return 'Commercial';
  if (parcelType === 2) return 'Industrial';
  return 'Other';
}

function getGridKey(lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

interface ProcessedParcel {
  apn: string;
  coords: [number, number];
  year: number;
  dateSource: 'added' | 'subdivision' | 'mapbook' | 'imputed';
  use: string;
  acres: number;
}

interface Cluster {
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  hasImputed: boolean;
  dateSources: Set<string>;
  totalAcres: number;
}

async function main() {
  console.log('Processing Clark County parcel data...\n');

  // Load raw data
  console.log('Loading raw data...');
  const parcelsRaw = JSON.parse(await readFile(`${INPUT_DIR}/parcels.geojson`, 'utf-8'));
  const subdivisionsRaw = JSON.parse(await readFile(`${INPUT_DIR}/subdivisions.geojson`, 'utf-8'));
  const addedRaw = JSON.parse(await readFile(`${INPUT_DIR}/added-parcels.geojson`, 'utf-8'));

  const parcels: RawParcel[] = parcelsRaw.features;
  const subdivisions: RawSubdivision[] = subdivisionsRaw.features;
  const addedParcels: AddedParcel[] = addedRaw.features;

  console.log(`  Parcels: ${parcels.length.toLocaleString()}`);
  console.log(`  Subdivisions: ${subdivisions.length.toLocaleString()}`);
  console.log(`  Added parcels: ${addedParcels.length.toLocaleString()}`);

  // Build lookup for added parcels (APN -> year)
  console.log('\nBuilding added parcel lookup...');
  const addedLookup = new Map<string, number>();
  for (const added of addedParcels) {
    if (added.properties.apn && added.properties.add_dt) {
      const year = new Date(added.properties.add_dt).getFullYear();
      if (year >= 2000 && year <= 2030) {
        addedLookup.set(added.properties.apn, year);
      }
    }
  }
  console.log(`  Added lookup: ${addedLookup.size.toLocaleString()} APNs with dates`);

  // Parse subdivision dates and build spatial index with bounding boxes
  console.log('\nParsing subdivision dates and building spatial index...');
  interface SubdivisionWithDate {
    geometry: RawSubdivision['geometry'];
    bbox: BBox;
    year: number;
    source: 'subdivision' | 'mapbook';
  }

  const subdivisionsWithDates: SubdivisionWithDate[] = [];
  let docNumDates = 0;
  let mapBookDates = 0;

  for (const sub of subdivisions) {
    if (!sub.geometry) continue;

    const bbox = getBoundingBox(sub.geometry);
    if (!bbox) continue;

    let year = parseDocNumYear(sub.properties.Doc_Num);
    let source: 'subdivision' | 'mapbook' = 'subdivision';

    if (year) {
      docNumDates++;
    } else {
      year = estimateYearFromMapBook(sub.properties.Map_Book);
      if (year) {
        mapBookDates++;
        source = 'mapbook';
      }
    }

    if (year) {
      subdivisionsWithDates.push({ geometry: sub.geometry, bbox, year, source });
    }
  }

  console.log(`  Doc_Num dates: ${docNumDates.toLocaleString()}`);
  console.log(`  Map_Book estimates: ${mapBookDates.toLocaleString()}`);
  console.log(`  Total with dates: ${subdivisionsWithDates.length.toLocaleString()}`);

  // Process parcels
  console.log('\nProcessing parcels...');
  const processed: ProcessedParcel[] = [];
  let addedCount = 0;
  let subdivisionCount = 0;
  let mapbookCount = 0;
  let imputedCount = 0;

  for (let i = 0; i < parcels.length; i++) {
    if (i % 100000 === 0 && i > 0) {
      console.log(`  Processed ${i.toLocaleString()} / ${parcels.length.toLocaleString()}`);
    }

    const parcel = parcels[i];
    if (!parcel.geometry || !parcel.properties.APN) continue;

    const coords = parcel.geometry.coordinates as [number, number];
    const apn = parcel.properties.APN;
    const use = getUseCategory(parcel.properties.PARCELTYPE, parcel.properties.Label_Class);
    const acres = parcel.properties.ASSR_ACRES || parcel.properties.CALC_ACRES || 0;

    let year: number;
    let dateSource: ProcessedParcel['dateSource'];

    // 1. Check added lookup first (most accurate)
    const addedYear = addedLookup.get(apn);
    if (addedYear) {
      year = addedYear;
      dateSource = 'added';
      addedCount++;
    } else {
      // 2. Check if parcel is in a dated subdivision (with bbox pre-filter)
      let foundInSub = false;
      for (const sub of subdivisionsWithDates) {
        // Quick bounding box rejection
        if (!pointInBBox(coords, sub.bbox)) continue;

        // Detailed polygon check
        const inSub = sub.geometry!.type === 'Polygon'
          ? pointInPolygon(coords, sub.geometry!.coordinates as number[][][])
          : pointInMultiPolygon(coords, sub.geometry!.coordinates as number[][][][]);

        if (inSub) {
          year = sub.year;
          dateSource = sub.source;
          if (sub.source === 'subdivision') {
            subdivisionCount++;
          } else {
            mapbookCount++;
          }
          foundInSub = true;
          break;
        }
      }

      // 3. Fall back to distance-based imputation
      if (!foundInSub) {
        year = imputeYearFromDistance(coords);
        dateSource = 'imputed';
        imputedCount++;
      }
    }

    processed.push({ apn, coords, year: year!, use, acres, dateSource: dateSource! });
  }

  console.log(`\nDate source breakdown:`);
  console.log(`  Added (2015-2021): ${addedCount.toLocaleString()} (${(addedCount / processed.length * 100).toFixed(1)}%)`);
  console.log(`  Subdivision Doc_Num: ${subdivisionCount.toLocaleString()} (${(subdivisionCount / processed.length * 100).toFixed(1)}%)`);
  console.log(`  Map_Book estimate: ${mapbookCount.toLocaleString()} (${(mapbookCount / processed.length * 100).toFixed(1)}%)`);
  console.log(`  Distance imputed: ${imputedCount.toLocaleString()} (${(imputedCount / processed.length * 100).toFixed(1)}%)`);

  // Build clusters for aggregated view
  console.log('\nBuilding clusters...');
  const clusters = new Map<string, Cluster>();
  let minYear = 9999;
  let maxYear = 0;

  for (const p of processed) {
    const key = getGridKey(p.coords[0], p.coords[1]);

    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = {
        lngSum: 0,
        latSum: 0,
        count: 0,
        useTypes: {},
        earliestYear: p.year,
        hasImputed: false,
        dateSources: new Set(),
        totalAcres: 0,
      };
      clusters.set(key, cluster);
    }

    cluster.lngSum += p.coords[0];
    cluster.latSum += p.coords[1];
    cluster.count++;
    cluster.useTypes[p.use] = (cluster.useTypes[p.use] || 0) + 1;
    cluster.totalAcres += p.acres;
    cluster.dateSources.add(p.dateSource);
    if (p.year < cluster.earliestYear) cluster.earliestYear = p.year;
    if (p.dateSource === 'imputed' || p.dateSource === 'mapbook') cluster.hasImputed = true;

    if (p.year < minYear) minYear = p.year;
    if (p.year > maxYear) maxYear = p.year;
  }

  console.log(`  Clusters: ${clusters.size.toLocaleString()}`);
  console.log(`  Year range: ${minYear} - ${maxYear}`);

  // Generate output GeoJSON
  console.log('\nGenerating output...');

  const aggregatedFeatures = [];
  for (const [key, cluster] of clusters) {
    let dominantUse = 'Other';
    let maxCount = 0;
    for (const [use, count] of Object.entries(cluster.useTypes)) {
      if (count > maxCount) {
        maxCount = count;
        dominantUse = use;
      }
    }

    const centroidLng = cluster.lngSum / cluster.count;
    const centroidLat = cluster.latSum / cluster.count;
    const startTime = `${cluster.earliestYear}-01-01T00:00:00Z`;

    aggregatedFeatures.push({
      type: 'Feature',
      properties: {
        y: cluster.earliestYear,  // shortened keys
        u: dominantUse,
        n: cluster.count,
        a: Math.round(cluster.totalAcres * 10) / 10,
        e: cluster.hasImputed ? 1 : 0,
        startTime,
        color: USE_COLORS[dominantUse] || '#95a5a6',
      },
      geometry: {
        type: 'Point',
        coordinates: [
          Math.round(centroidLng * 100000) / 100000,  // 5 decimal places (~1m precision)
          Math.round(centroidLat * 100000) / 100000,
        ],
      },
    });
  }

  // Sort by year for animation
  aggregatedFeatures.sort((a, b) => a.properties.y - b.properties.y);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const outputPath = `${OUTPUT_DIR}/parcels.geojson`;
  await writeFile(outputPath, JSON.stringify({
    type: 'FeatureCollection',
    features: aggregatedFeatures,
  }));
  console.log(`\nWrote ${outputPath} (${aggregatedFeatures.length.toLocaleString()} clusters)`);

  // Build APN -> date lookup from processed parcels
  const apnDateLookup = new Map<string, { year: number; use: string; estimated: boolean }>();
  for (const p of processed) {
    apnDateLookup.set(p.apn, {
      year: p.year,
      use: p.use,
      estimated: p.dateSource === 'imputed' || p.dateSource === 'mapbook',
    });
  }

  // Process polygon data if available
  console.log('\nProcessing parcel polygons...');
  let polygonsRaw;
  try {
    polygonsRaw = JSON.parse(await readFile(`${INPUT_DIR}/parcel-polygons.geojson`, 'utf-8'));
  } catch {
    console.log('  Polygon data not found, skipping detailed output.');
    console.log(`\nDone! Timeline range: ${minYear}-${maxYear}`);
    console.log(`\nNote: Dates marked 'estimated' are imputed from subdivision records or distance from downtown.`);
    return;
  }

  const polygons: RawParcelPolygon[] = polygonsRaw.features;
  console.log(`  Loaded ${polygons.length.toLocaleString()} polygons`);

  const detailedFeatures = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const polygon of polygons) {
    if (!polygon.geometry || !polygon.properties.APN) continue;

    const apn = polygon.properties.APN;
    const dateInfo = apnDateLookup.get(apn);

    let year: number;
    let use: string;
    let estimated: boolean;

    if (dateInfo) {
      year = dateInfo.year;
      use = dateInfo.use;
      estimated = dateInfo.estimated;
      matchedCount++;
    } else {
      // Fallback for unmatched polygons - use centroid for distance imputation
      const coords = getCentroidFromPolygon(polygon.geometry);
      year = imputeYearFromDistance(coords);
      use = getUseCategory(polygon.properties.PARCELTYPE, polygon.properties.Label_Class);
      estimated = true;
      unmatchedCount++;
    }

    const startTime = `${year}-01-01T00:00:00Z`;

    detailedFeatures.push({
      type: 'Feature',
      properties: {
        y: year,
        u: use,
        e: estimated ? 1 : 0,
        startTime,
        color: USE_COLORS[use] || '#95a5a6',
      },
      geometry: polygon.geometry,
    });
  }

  console.log(`  Matched: ${matchedCount.toLocaleString()}, Unmatched: ${unmatchedCount.toLocaleString()}`);

  // Sort by year
  detailedFeatures.sort((a, b) => a.properties.y - b.properties.y);

  const detailedPath = `${OUTPUT_DIR}/parcels-detailed.geojson`;
  await writeFile(detailedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: detailedFeatures,
  }));
  console.log(`  Wrote ${detailedPath} (${detailedFeatures.length.toLocaleString()} polygons)`);

  console.log(`\nDone! Timeline range: ${minYear}-${maxYear}`);
  console.log(`\nNote: Dates marked 'estimated' are imputed from subdivision records or distance from downtown.`);
  console.log(`\nTo convert to PMTiles, run: tippecanoe -o parcels.pmtiles -Z10 -z16 --drop-densest-as-needed ${detailedPath}`);
}

function getCentroidFromPolygon(geometry: RawParcelPolygon['geometry']): [number, number] {
  let coords: number[][][];

  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates as number[][][];
  } else {
    coords = (geometry.coordinates as number[][][][])[0];
  }

  const ring = coords[0];
  let sumLng = 0;
  let sumLat = 0;

  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }

  return [sumLng / ring.length, sumLat / ring.length];
}

main().catch(console.error);
