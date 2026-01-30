import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const INPUT_PATH = new URL('../../data/raw/la-county/parcels.ndjson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/la-county', import.meta.url).pathname;

const GRID_SIZE = 0.0052; // ~520m grid cells

// LA County APNs are 10 digits: XXXX-XXX-XXX (book-page-parcel)
// Extract just book number for neighborhood-level grouping
function getBlockId(apn: string): string {
  const cleaned = apn.replace(/[^0-9]/g, '');
  if (cleaned.length >= 4) {
    return cleaned.substring(0, 4);
  }
  return cleaned || 'unknown';
}

function getClusterKey(apn: string, lng: number, lat: number): string {
  const blockId = getBlockId(apn);
  const gridLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
  const gridLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
  return `${blockId}:${gridLng.toFixed(4)},${gridLat.toFixed(4)}`;
}

interface RawFeature {
  type: 'Feature';
  properties: {
    APN: string | null;
    YearBuilt1: string | null;
    EffectiveYear1: string | null;
    UseCode: string | null;
    UseType: string | null;
    UseDescription: string | null;
    SitusFullAddress: string | null;
    SitusCity: string | null;
    SitusZIP: string | null;
    SQFTmain1: number | null;
    Units1: number | null;
    Bedrooms1: number | null;
    Bathrooms1: number | null;
    Roll_LandValue: number | null;
    Roll_ImpValue: number | null;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  } | null;
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

// LA County UseType values: Residential, Commercial, Industrial, Recreational, Institutional, Miscellaneous
function getUseCategory(useType: string | null, useDesc: string | null): string {
  const type = (useType || '').toLowerCase();
  const desc = (useDesc || '').toLowerCase();

  if (type.includes('residential')) {
    if (desc.includes('single') || desc.includes('sfr') || desc.includes('1 unit')) {
      return 'Single Family';
    }
    if (desc.includes('multi') || desc.includes('apartment') || desc.includes('condo') ||
        desc.includes('duplex') || desc.includes('triplex') || desc.includes('2-4 unit') ||
        desc.includes('5+ unit') || desc.includes('units')) {
      return 'Multi-Family';
    }
    return 'Single Family';
  }

  if (type.includes('commercial')) {
    if (desc.includes('mixed') || desc.includes('live/work')) {
      return 'Mixed';
    }
    return 'Commercial';
  }

  if (type.includes('industrial')) {
    return 'Industrial';
  }

  if (type.includes('recreational') || desc.includes('park') || desc.includes('golf') ||
      desc.includes('open space') || desc.includes('vacant')) {
    return 'Open Space';
  }

  if (type.includes('institutional') || desc.includes('school') || desc.includes('church') ||
      desc.includes('government') || desc.includes('public') || desc.includes('hospital')) {
    return 'Public';
  }

  if (desc.includes('single') || desc.includes('sfr')) return 'Single Family';
  if (desc.includes('multi') || desc.includes('apartment')) return 'Multi-Family';
  if (desc.includes('retail') || desc.includes('office') || desc.includes('store')) return 'Commercial';
  if (desc.includes('warehouse') || desc.includes('manufacturing')) return 'Industrial';

  return 'Unknown';
}

function getUseColor(category: string): string {
  return USE_COLORS[category] || '#95a5a6';
}

function getCentroid(geometry: NonNullable<RawFeature['geometry']>): [number, number] {
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
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  totalArea: number;
  hasEstimates: boolean;
}

async function main() {
  console.log('Processing LA County parcel data...');

  // Check file exists
  try {
    await stat(INPUT_PATH);
  } catch {
    console.error(`Input file not found: ${INPUT_PATH}`);
    console.error('Run pipeline:la-county-fetch first');
    process.exit(1);
  }

  // First pass: analyze year coverage for median estimation
  console.log('\nPass 1: Analyzing year coverage...');
  const yearsByUse: Record<string, number[]> = {};
  let totalCount = 0;
  let withYear = 0;
  let withoutYear = 0;

  const rl1 = createInterface({
    input: createReadStream(INPUT_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of rl1) {
    if (!line.trim()) continue;
    totalCount++;

    try {
      const feature = JSON.parse(line) as RawFeature;
      const yearStr = feature.properties.YearBuilt1;
      const year = yearStr ? parseInt(yearStr, 10) : 0;
      const useCategory = getUseCategory(feature.properties.UseType, feature.properties.UseDescription);

      if (year && year >= 1800 && year <= 2025) {
        withYear++;
        if (!yearsByUse[useCategory]) yearsByUse[useCategory] = [];
        yearsByUse[useCategory].push(year);
      } else {
        withoutYear++;
      }

      if (totalCount % 500000 === 0) {
        console.log(`  Analyzed ${totalCount.toLocaleString()} parcels...`);
      }
    } catch (e) {
      // Skip malformed lines
    }
  }

  console.log(`\nTotal parcels: ${totalCount.toLocaleString()}`);
  console.log(`  With year: ${withYear.toLocaleString()} (${((withYear / totalCount) * 100).toFixed(1)}%)`);
  console.log(`  Without year: ${withoutYear.toLocaleString()}`);

  // Calculate medians
  const medianByUse: Record<string, number> = {};
  for (const [use, years] of Object.entries(yearsByUse)) {
    const sorted = [...years].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianByUse[use] = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  const allYears = Object.values(yearsByUse).flat();
  const sortedAll = [...allYears].sort((a, b) => a - b);
  const globalMedian = sortedAll[Math.floor(sortedAll.length / 2)] || 1960;

  console.log(`\nMedian years by use type:`);
  for (const [use, med] of Object.entries(medianByUse).sort((a, b) => a[1] - b[1])) {
    const count = yearsByUse[use]?.length || 0;
    console.log(`  ${use}: ${med} (${count.toLocaleString()} parcels)`);
  }
  console.log(`  Global median: ${globalMedian}`);

  // Second pass: process and write output
  console.log('\nPass 2: Processing and clustering...');

  await mkdir(OUTPUT_DIR, { recursive: true });

  // We need to collect clusters in memory (these are small)
  const clusters: Map<string, Cluster> = new Map();
  let minYear = 9999;
  let maxYear = 0;
  let processed = 0;
  let skipped = 0;

  // Stream detailed output directly to file
  const detailedPath = `${OUTPUT_DIR}/parcels-detailed.ndjson`;
  const detailedStream = createWriteStream(detailedPath);

  const rl2 = createInterface({
    input: createReadStream(INPUT_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of rl2) {
    if (!line.trim()) continue;

    try {
      const feature = JSON.parse(line) as RawFeature;
      const { APN, YearBuilt1, UseType, UseDescription, SitusFullAddress, SitusCity, SQFTmain1 } = feature.properties;

      if (!feature.geometry) {
        skipped++;
        continue;
      }

      const yearNum = YearBuilt1 ? parseInt(YearBuilt1, 10) : 0;
      const hasKnownYear = yearNum >= 1800 && yearNum <= 2025;
      const useCategory = getUseCategory(UseType, UseDescription);
      const year = hasKnownYear ? yearNum : (medianByUse[useCategory] || globalMedian);
      const estimated = !hasKnownYear;

      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;

      const startTime = `${year}-01-01T00:00:00Z`;
      const color = getUseColor(useCategory);
      const apn = APN?.trim() || '';

      const address = SitusFullAddress
        ? `${SitusFullAddress}${SitusCity ? `, ${SitusCity}` : ''}`
        : '';

      // Write detailed feature to stream
      const detailedFeature = {
        type: 'Feature',
        properties: {
          apn,
          year,
          estimated,
          use: useCategory,
          address,
          area: SQFTmain1 || 0,
          startTime,
          color,
        },
        geometry: feature.geometry,
      };
      detailedStream.write(JSON.stringify(detailedFeature) + '\n');

      // Clustering - use building centroid, don't cross blocks
      const [lng, lat] = getCentroid(feature.geometry);
      const clusterKey = getClusterKey(apn, lng, lat);

      let cluster = clusters.get(clusterKey);
      if (!cluster) {
        cluster = {
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
      cluster.totalArea += SQFTmain1 || 0;
      if (year < cluster.earliestYear) cluster.earliestYear = year;
      if (estimated) cluster.hasEstimates = true;

      processed++;
      if (processed % 500000 === 0) {
        console.log(`  Processed ${processed.toLocaleString()} parcels, ${clusters.size.toLocaleString()} clusters...`);
      }
    } catch (e) {
      skipped++;
    }
  }

  // Close detailed stream
  await new Promise<void>((resolve, reject) => {
    detailedStream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`\nProcessed ${processed.toLocaleString()} parcels into ${clusters.size.toLocaleString()} clusters`);
  if (skipped > 0) console.log(`Skipped ${skipped.toLocaleString()} parcels`);
  console.log(`Year range: ${minYear} - ${maxYear}`);

  // Build and write aggregated features
  console.log('\nWriting aggregated clusters...');

  interface AggFeature {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: number[] };
  }

  const aggregatedFeatures: AggFeature[] = [];

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

  // Sort by year
  aggregatedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));

  const aggregatedPath = `${OUTPUT_DIR}/parcels.geojson`;
  const aggregatedStream = createWriteStream(aggregatedPath);
  aggregatedStream.write('{"type":"FeatureCollection","features":[\n');

  for (let i = 0; i < aggregatedFeatures.length; i++) {
    const suffix = i < aggregatedFeatures.length - 1 ? ',\n' : '\n';
    aggregatedStream.write(JSON.stringify(aggregatedFeatures[i]) + suffix);
  }

  aggregatedStream.write(']}');

  await new Promise<void>((resolve, reject) => {
    aggregatedStream.end((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`\nWrote ${aggregatedPath} (${aggregatedFeatures.length.toLocaleString()} clusters)`);
  console.log(`Wrote ${detailedPath} (${processed.toLocaleString()} parcels as NDJSON)`);
  console.log(`\nDone! Year range for timeline: ${minYear}-${maxYear}`);
}

main().catch(console.error);
