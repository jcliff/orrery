import { readFile, writeFile, mkdir } from 'node:fs/promises';

const INPUT_PATH = new URL('../../data/raw/livermore/parcels.geojson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/livermore', import.meta.url).pathname;

const GRID_SIZE = 0.0005;

// Extract block ID from APN (format: "097 014703200" -> "097-0147")
function getBlockId(apn: string): string {
  const cleaned = apn.replace(/\s+/g, '');
  if (cleaned.length >= 7) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 7)}`;
  }
  return cleaned || 'unknown';
}

function getGridKey(lng: number, lat: number): string {
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

function getClusterKey(apn: string, lng: number, lat: number): string {
  return `${getBlockId(apn)}:${getGridKey(lng, lat)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    APN: string;
    YrBuilt: string | null;
    EffYr: string | null;
    SitusNum: string | null;
    SitusStreet: string | null;
    SitusCity: string | null;
    LandUseDescription: string | null;
    LandUseCategory: string | null;
    LotSize: number | null;
    BldgArea: number | null;
    Stories: number | null;
    Beds: number | null;
    Baths: number | null;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

const USE_COLORS: Record<string, string> = {
  'Single Family': '#3498db',
  'Multi-Family': '#9b59b6',
  'Commercial': '#e74c3c',
  'Industrial': '#7f8c8d',
  'Open Space': '#27ae60',
  'Public': '#2ecc71',
  'Mixed': '#1abc9c',
  'Unknown': '#95a5a6',
};

function getUseCategory(landUse: string | null): string {
  if (!landUse) return 'Unknown';
  const lower = landUse.toLowerCase();

  if (lower.includes('single') || lower.includes('low residential') || lower.includes('ul-')) {
    return 'Single Family';
  }
  if (lower.includes('multi') || lower.includes('high residential') || lower.includes('medium residential') || lower.includes('umh')) {
    return 'Multi-Family';
  }
  if (lower.includes('commercial') || lower.includes('retail') || lower.includes('office')) {
    return 'Commercial';
  }
  if (lower.includes('industrial') || lower.includes('business park')) {
    return 'Industrial';
  }
  if (lower.includes('open space') || lower.includes('park') || lower.includes('agriculture') || lower.includes('vineyard')) {
    return 'Open Space';
  }
  if (lower.includes('public') || lower.includes('school') || lower.includes('civic')) {
    return 'Public';
  }
  if (lower.includes('mixed')) {
    return 'Mixed';
  }

  return 'Unknown';
}

function getUseColor(category: string): string {
  return USE_COLORS[category] || '#95a5a6';
}

function getCentroid(geometry: RawFeature['geometry']): [number, number] {
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

interface Cluster {
  blockId: string;
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  totalArea: number;
  hasEstimates: boolean;
}

async function main() {
  console.log('Processing Livermore parcel data...');

  const content = await readFile(INPUT_PATH, 'utf-8');
  const raw = JSON.parse(content) as { type: string; features: RawFeature[] };

  console.log(`Loaded ${raw.features.length} parcels`);

  let withYear = 0;
  let withoutYear = 0;
  const yearsByUse: Record<string, number[]> = {};

  for (const feature of raw.features) {
    const yearStr = feature.properties.YrBuilt;
    const year = yearStr ? parseInt(yearStr, 10) : 0;
    const useCategory = getUseCategory(feature.properties.LandUseDescription);

    if (year && year >= 1800 && year <= 2025) {
      withYear++;
      if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
      yearsByUse[useCategory].push(year);
    } else {
      withoutYear++;
    }
  }

  console.log(`\nYear data coverage:`);
  console.log(`  With year: ${withYear.toLocaleString()} (${((withYear / raw.features.length) * 100).toFixed(1)}%)`);
  console.log(`  Without year: ${withoutYear.toLocaleString()}`);

  const medianByUse: Record<string, number> = {};
  for (const [use, years] of Object.entries(yearsByUse)) {
    const sorted = [...years].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianByUse[use] = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  const allYears = Object.values(yearsByUse).flat();
  const sortedAll = [...allYears].sort((a, b) => a - b);
  const globalMedian = sortedAll[Math.floor(sortedAll.length / 2)] || 1985;

  console.log(`\nMedian years by use type:`);
  for (const [use, med] of Object.entries(medianByUse).sort((a, b) => a[1] - b[1])) {
    console.log(`  ${use}: ${med}`);
  }
  console.log(`  Global median: ${globalMedian}`);

  const detailedFeatures: GeoJSONFeature[] = [];
  const clusters: Map<string, Cluster> = new Map();
  let minYear = 9999;
  let maxYear = 0;

  for (const feature of raw.features) {
    const { APN, YrBuilt, SitusNum, SitusStreet, SitusCity, LandUseDescription, LotSize, BldgArea } = feature.properties;

    if (!feature.geometry) continue;

    const yearNum = YrBuilt ? parseInt(YrBuilt, 10) : 0;
    const hasKnownYear = yearNum >= 1800 && yearNum <= 2025;
    const useCategory = getUseCategory(LandUseDescription);
    const year = hasKnownYear ? yearNum : (medianByUse[useCategory] || globalMedian);
    const estimated = !hasKnownYear;

    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;

    const startTime = `${year}-01-01T00:00:00Z`;
    const color = getUseColor(useCategory);

    const address = SitusNum && SitusStreet
      ? `${SitusNum} ${SitusStreet}${SitusCity ? `, ${SitusCity}` : ''}`
      : '';

    detailedFeatures.push({
      type: 'Feature',
      properties: {
        apn: APN?.trim() || '',
        year,
        estimated,
        use: useCategory,
        address,
        area: LotSize || BldgArea || 0,
        startTime,
        color,
      },
      geometry: feature.geometry,
    });

    const [lng, lat] = getCentroid(feature.geometry);
    const clusterKey = getClusterKey(APN || '', lng, lat);
    const blockId = getBlockId(APN || '');

    let cluster = clusters.get(clusterKey);
    if (!cluster) {
      cluster = {
        blockId,
        lngSum: 0,
        latSum: 0,
        count: 0,
        useTypes: {},
        earliestYear: year,
        totalArea: 0,
        hasEstimates: false,
      };
      clusters.set(clusterKey, cluster);
    }

    cluster.lngSum += lng;
    cluster.latSum += lat;
    cluster.count++;
    cluster.useTypes[useCategory] = (cluster.useTypes[useCategory] || 0) + 1;
    cluster.totalArea += LotSize || BldgArea || 0;
    if (year < cluster.earliestYear) cluster.earliestYear = year;
    if (estimated) cluster.hasEstimates = true;
  }

  console.log(`\nProcessed ${detailedFeatures.length} parcels into ${clusters.size} clusters`);
  console.log(`Year range: ${minYear} - ${maxYear}`);

  const aggregatedFeatures: GeoJSONFeature[] = [];

  for (const cluster of clusters.values()) {
    let dominantUse = 'Unknown';
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
        blockId: cluster.blockId,
        year: cluster.earliestYear,
        use: dominantUse,
        count: cluster.count,
        area: Math.round(cluster.totalArea),
        estimated: cluster.hasEstimates,
        startTime,
        color: getUseColor(dominantUse),
      },
      geometry: {
        type: 'Point',
        coordinates: [centroidLng, centroidLat],
      },
    });
  }

  detailedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));
  aggregatedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));

  await mkdir(OUTPUT_DIR, { recursive: true });

  const aggregatedPath = `${OUTPUT_DIR}/parcels.geojson`;
  await writeFile(aggregatedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: aggregatedFeatures,
  }));
  console.log(`\nWrote ${aggregatedPath} (${aggregatedFeatures.length} clusters)`);

  const detailedPath = `${OUTPUT_DIR}/parcels-detailed.geojson`;
  await writeFile(detailedPath, JSON.stringify({
    type: 'FeatureCollection',
    features: detailedFeatures,
  }));
  console.log(`Wrote ${detailedPath} (${detailedFeatures.length} parcels)`);

  console.log(`\nDone! Year range for timeline: ${minYear}-${maxYear}`);
}

main().catch(console.error);
