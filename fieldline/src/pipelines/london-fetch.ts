/**
 * London planning applications fetch pipeline.
 * Uses the Planning London Datahub API (Elasticsearch-based).
 *
 * API docs: https://www.london.gov.uk/programmes-strategies/planning/digital-planning/planning-london-datahub
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { getCache, geoJsonFeatureId } from '../core/cache.js';
import { toWGS84, registerProjection } from '../core/schema-normalizer.js';

const OUTPUT_DIR = new URL('../../data/raw/london', import.meta.url).pathname;
const SOURCE_ID = 'london-planning';

// Planning London Datahub API (Elasticsearch)
const API_URL = 'https://planningdata.london.gov.uk/api-guest/applications/_search';
const BATCH_SIZE = 1000; // Elasticsearch default max

// Register British National Grid projection
registerProjection(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
);

interface LondonApplication {
  id: string;
  lpa_app_no: string;
  lpa_name: string;
  borough: string;
  site_name: string | null;
  site_number: string;
  street_name: string;
  postcode: string;
  description: string;
  application_type: string;
  application_type_full: string;
  development_type: string;
  decision: string | null;
  decision_date: string | null;
  valid_date: string;
  status: string;
  centroid?: {
    lat: string;
    lon: string;
  };
  centroid_easting?: string;
  centroid_northing?: string;
  wgs84_polygon?: {
    type: string;
    coordinates: number[][][];
  };
}

interface ElasticsearchResponse {
  hits: {
    total: { value: number };
    hits: Array<{
      _id: string;
      _source: LondonApplication;
    }>;
  };
}

async function fetchBatch(from: number): Promise<{ records: LondonApplication[]; total: number }> {
  console.log(`Fetching from ${from}...`);

  const query = {
    from,
    size: BATCH_SIZE,
    query: {
      bool: {
        must: [
          { exists: { field: 'decision_date' } },
        ],
      },
    },
    sort: [{ decision_date: 'desc' }],
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data: ElasticsearchResponse = await res.json();

  return {
    records: data.hits.hits.map((h) => ({ ...h._source, _id: h._id })),
    total: data.hits.total.value,
  };
}

function parseUKDate(dateStr: string | null): { year: number; iso: string } | null {
  if (!dateStr) return null;

  // ISO format: YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      iso: dateStr.slice(0, 10),
    };
  }

  // UK format: DD/MM/YYYY
  const ukMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return {
      year: parseInt(year, 10),
      iso: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    };
  }

  return null;
}

function toGeoJSON(records: LondonApplication[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const r of records) {
    let coordinates: [number, number] | null = null;

    // Try centroid field first (WGS84, but as strings)
    if (r.centroid?.lat && r.centroid?.lon) {
      const lat = parseFloat(r.centroid.lat);
      const lon = parseFloat(r.centroid.lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        coordinates = [lon, lat];
      }
    }
    // Fall back to easting/northing (British National Grid)
    else if (r.centroid_easting && r.centroid_northing) {
      try {
        const easting = parseFloat(r.centroid_easting);
        const northing = parseFloat(r.centroid_northing);
        if (!isNaN(easting) && !isNaN(northing)) {
          coordinates = toWGS84([easting, northing], 'EPSG:27700');
        }
      } catch {
        continue;
      }
    }

    if (!coordinates) continue;

    // Validate coordinates are in London bounds
    const [lng, lat] = coordinates;
    if (lng < -1 || lng > 1 || lat < 51 || lat > 52) {
      continue;
    }

    const decisionDate = parseUKDate(r.decision_date);
    const validDate = parseUKDate(r.valid_date);

    // Build address from parts
    const address = [r.site_number, r.street_name, r.postcode]
      .filter(Boolean)
      .join(' ');

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates,
      },
      properties: {
        id: r.id,
        lpaAppNo: r.lpa_app_no,
        lpaName: r.lpa_name,
        borough: r.borough,
        address,
        description: r.description,
        applicationType: r.application_type,
        applicationTypeFull: r.application_type_full,
        developmentType: r.development_type,
        status: r.status,
        decision: r.decision,
        decisionDate: decisionDate?.iso || null,
        decisionYear: decisionDate?.year || null,
        validDate: validDate?.iso || null,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function main() {
  console.log('Fetching London Planning Applications from Planning London Datahub...');
  console.log(`Endpoint: ${API_URL}\n`);

  // Check cache first
  const cache = await getCache();
  const meta = cache.getSourceMetadata(SOURCE_ID);

  if (meta && !cache.needsRefresh(SOURCE_ID, 24)) {
    console.log(
      `Using cached data (${meta.recordCount.toLocaleString()} records from ${meta.lastFetched})`
    );
    const cached = cache.getFeatures<GeoJSON.Feature>(SOURCE_ID);

    await mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/planning.geojson`;
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cached,
    };
    await writeFile(outputPath, JSON.stringify(geojson));
    console.log(`Wrote ${outputPath} (${cached.length} applications from cache)`);
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Get first batch to learn total
  const first = await fetchBatch(0);
  const total = Math.min(first.total, 100000); // Limit to 100k for initial test
  console.log(`Total records: ${first.total.toLocaleString()} (fetching up to 100k)\n`);

  const allRecords: LondonApplication[] = [...first.records];
  console.log(`  Batch 0: ${first.records.length} records (total: ${allRecords.length} / ${total})`);

  // Fetch remaining batches
  let from = BATCH_SIZE;
  let batchNum = 1;

  while (from < total) {
    try {
      const batch = await fetchBatch(from);
      allRecords.push(...batch.records);
      console.log(
        `  Batch ${batchNum}: ${batch.records.length} records (total: ${allRecords.length} / ${total})`
      );
    } catch (e) {
      console.warn(`Batch ${batchNum} failed: ${e}`);
      break;
    }

    from += BATCH_SIZE;
    batchNum++;

    // Elasticsearch has a 10k default limit for deep pagination
    if (from >= 10000) {
      console.log('\nReached Elasticsearch pagination limit (10k). Use scroll API for more.');
      break;
    }
  }

  // Convert to GeoJSON
  console.log('\nConverting to GeoJSON...');
  const geojson = toGeoJSON(allRecords);
  console.log(`Converted to ${geojson.features.length} GeoJSON features (with coordinates)`);

  // Cache the results
  cache.upsertFeatures(SOURCE_ID, geojson.features, (f, i) =>
    geoJsonFeatureId(f, i, 'id')
  );
  cache.updateSourceMetadata(SOURCE_ID, {
    recordCount: geojson.features.length,
  });

  // Write output
  const outputPath = `${OUTPUT_DIR}/planning.geojson`;
  await writeFile(outputPath, JSON.stringify(geojson));
  console.log(`\nWrote ${outputPath} (${geojson.features.length} applications)`);

  // Summary stats
  const byLpa = new Map<string, number>();
  for (const f of geojson.features) {
    const lpa = (f.properties?.lpaName as string) || 'Unknown';
    byLpa.set(lpa, (byLpa.get(lpa) || 0) + 1);
  }
  console.log('\nTop boroughs:');
  for (const [lpa, count] of [...byLpa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${lpa}: ${count.toLocaleString()}`);
  }
}

main().catch(console.error);
