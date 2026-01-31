/**
 * Storey County parcel processing pipeline.
 * Processes geocoded assessor data into visualization-ready format.
 * Note: Storey County (Virginia City) is historic Comstock Lode territory.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  getBlockId, getClusterKey, median, findDominant,
  createCluster, addToCluster, type Cluster,
} from '../utils/parcel-clustering';
import { getUseColor, getUseLabel, getLabelColor } from '../utils/nevada-land-use';

const INPUT_PATH = new URL('../../data/raw/storey/parcels-geocoded.geojson', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../../../chrona/public/data/storey', import.meta.url).pathname;

interface RawFeature {
  type: 'Feature';
  properties: {
    APN: string | number | null;
    YEARBLT: number | null;
    LAND_USE: string | null;
    FullAddress: string | null;
    SQFEET: number | null;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

async function main() {
  console.log('Processing Storey County parcel data...');

  const content = await readFile(INPUT_PATH, 'utf-8');
  const raw = JSON.parse(content) as { features: RawFeature[] };
  console.log(`Loaded ${raw.features.length} parcels`);

  // First pass: collect year statistics
  const yearsByUse: Record<string, number[]> = {};
  let withYear = 0, withoutYear = 0;

  for (const feature of raw.features) {
    const year = feature.properties.YEARBLT;
    const use = feature.properties.LAND_USE || 'Unknown';
    if (year && year >= 1800 && year <= 2025) {
      withYear++;
      (yearsByUse[use] ??= []).push(year);
    } else {
      withoutYear++;
    }
  }

  console.log(`\nYear coverage: ${withYear.toLocaleString()} (${((withYear / raw.features.length) * 100).toFixed(1)}%) with year`);

  const medianByUse: Record<string, number> = {};
  for (const [use, years] of Object.entries(yearsByUse)) {
    medianByUse[use] = median(years);
  }
  const globalMedian = median(Object.values(yearsByUse).flat()) || 1900;

  // Second pass: create features and clusters
  const detailedFeatures: Array<{ type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }> = [];
  const clusters = new Map<string, Cluster>();
  let minYear = 9999, maxYear = 0;

  for (const feature of raw.features) {
    if (!feature.geometry) continue;

    const { APN, YEARBLT, LAND_USE, FullAddress, SQFEET } = feature.properties;
    const hasKnownYear = YEARBLT && YEARBLT >= 1800 && YEARBLT <= 2025;
    const use = LAND_USE || 'Unknown';
    const year = hasKnownYear ? YEARBLT : (medianByUse[use] || globalMedian);
    const estimated = !hasKnownYear;
    const useLabel = getUseLabel(LAND_USE);

    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;

    detailedFeatures.push({
      type: 'Feature',
      properties: {
        apn: APN ? String(APN) : '',
        year, estimated, use: useLabel,
        address: FullAddress || '',
        area: SQFEET || 0,
        startTime: `${year}-01-01T00:00:00Z`,
        color: getUseColor(LAND_USE),
      },
      geometry: feature.geometry,
    });

    const [lng, lat] = feature.geometry.coordinates;
    const clusterKey = getClusterKey(APN, lng, lat);

    let cluster = clusters.get(clusterKey);
    if (!cluster) {
      cluster = createCluster(getBlockId(APN), year);
      clusters.set(clusterKey, cluster);
    }
    addToCluster(cluster, lng, lat, useLabel, year, SQFEET || 0, estimated);
  }

  console.log(`Processed ${detailedFeatures.length} parcels into ${clusters.size} clusters`);
  console.log(`Year range: ${minYear} - ${maxYear}`);

  // Create aggregated features
  const aggregatedFeatures = Array.from(clusters.values()).map(cluster => {
    const dominantUse = findDominant(cluster.useTypes, 'Unknown');
    return {
      type: 'Feature' as const,
      properties: {
        blockId: cluster.blockId,
        year: cluster.earliestYear,
        use: dominantUse,
        count: cluster.count,
        area: Math.round(cluster.totalArea),
        estimated: cluster.hasEstimates,
        startTime: `${cluster.earliestYear}-01-01T00:00:00Z`,
        color: getLabelColor(dominantUse),
      },
      geometry: {
        type: 'Point',
        coordinates: [cluster.lngSum / cluster.count, cluster.latSum / cluster.count],
      },
    };
  });

  detailedFeatures.sort((a, b) => (a.properties.year as number) - (b.properties.year as number));
  aggregatedFeatures.sort((a, b) => a.properties.year - b.properties.year);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(`${OUTPUT_DIR}/parcels.geojson`, JSON.stringify({ type: 'FeatureCollection', features: aggregatedFeatures }));
  await writeFile(`${OUTPUT_DIR}/parcels-detailed.geojson`, JSON.stringify({ type: 'FeatureCollection', features: detailedFeatures }));

  console.log(`\nWrote ${aggregatedFeatures.length} clusters and ${detailedFeatures.length} detailed parcels`);
}

main().catch(console.error);
