/**
 * Berkeley parcel fetch pipeline.
 * Uses custom fetching because Berkeley's MapServer doesn't support geojson format
 * with geometry at scale - we fetch JSON format and convert to GeoJSON.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import proj4 from 'proj4';
import { getCache, geoJsonFeatureId } from '../core/cache.js';
import { getSource } from '../registry/sources.js';

const OUTPUT_DIR = new URL('../../data/raw/berkeley', import.meta.url).pathname;
const SOURCE = getSource('berkeley');

// Berkeley uses UTM Zone 10N (EPSG:32610)
proj4.defs('EPSG:32610', '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs');

interface EsriRing {
  rings: number[][][];
}

interface EsriFeature {
  attributes: Record<string, unknown>;
  geometry: EsriRing | null;
}

interface EsriResponse {
  features: EsriFeature[];
  exceededTransferLimit?: boolean;
}

function esriToGeoJSON(feature: EsriFeature): GeoJSON.Feature | null {
  if (!feature.geometry || !feature.geometry.rings) {
    return null;
  }

  // Convert rings from UTM to WGS84
  const rings = feature.geometry.rings.map(ring =>
    ring.map(([x, y]) => {
      const [lng, lat] = proj4('EPSG:32610', 'EPSG:4326', [x, y]);
      return [lng, lat];
    })
  );

  return {
    type: 'Feature',
    properties: feature.attributes,
    geometry: {
      type: 'Polygon',
      coordinates: rings,
    },
  };
}

async function fetchBatch(offset: number, batchSize: number): Promise<EsriResponse> {
  const api = SOURCE.api as { url: string; outFields: string[]; where?: string };
  const params = new URLSearchParams({
    where: api.where || '1=1',
    outFields: api.outFields.join(','),
    returnGeometry: 'true',
    f: 'json',
    resultOffset: offset.toString(),
    resultRecordCount: batchSize.toString(),
  });

  const res = await fetch(`${api.url}?${params}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function getCount(): Promise<number> {
  const api = SOURCE.api as { url: string; where?: string };
  const params = new URLSearchParams({
    where: api.where || '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });

  const res = await fetch(`${api.url}?${params}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.count;
}

async function main() {
  console.log(`Fetching ${SOURCE.name} from ${SOURCE.attribution}...`);
  console.log(`Endpoint: ${(SOURCE.api as { url: string }).url}\n`);

  // Check cache first
  const cache = await getCache();
  const meta = cache.getSourceMetadata(SOURCE.id);

  if (meta && !cache.needsRefresh(SOURCE.id, 24)) {
    console.log(
      `Using cached data (${meta.recordCount.toLocaleString()} records from ${meta.lastFetched})`
    );
    const cached = cache.getFeatures<GeoJSON.Feature>(SOURCE.id);

    await mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/parcels.geojson`;
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cached,
    };
    await writeFile(outputPath, JSON.stringify(geojson));
    console.log(`Wrote ${outputPath} (${cached.length} parcels from cache)`);
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Get total count
  const totalCount = await getCount();
  console.log(`Total records: ${totalCount.toLocaleString()}`);

  // Fetch all batches sequentially (MapServer has issues with parallel offset queries)
  const BATCH_SIZE = 1000;
  const MAX_BATCHES = 50;
  const allFeatures: GeoJSON.Feature[] = [];
  let offset = 0;
  let batchNum = 0;

  while (batchNum < MAX_BATCHES) {
    const data = await fetchBatch(offset, BATCH_SIZE);

    if (data.features.length === 0) {
      break;
    }

    // Convert ESRI JSON to GeoJSON
    const geoFeatures = data.features
      .map(esriToGeoJSON)
      .filter((f): f is GeoJSON.Feature => f !== null);

    allFeatures.push(...geoFeatures);
    console.log(`  Batch ${batchNum}: ${data.features.length} features (${geoFeatures.length} with geometry)`);

    // Check if we should continue
    if (!data.exceededTransferLimit && data.features.length < BATCH_SIZE) {
      break;
    }

    offset += data.features.length;
    batchNum++;
  }

  console.log(`\nFetched ${allFeatures.length.toLocaleString()} features`);

  // Cache the results
  cache.upsertFeatures(SOURCE.id, allFeatures, (f, i) =>
    geoJsonFeatureId(f, i, 'APN')
  );
  cache.updateSourceMetadata(SOURCE.id, {
    recordCount: allFeatures.length,
  });

  // Write combined GeoJSON
  const outputPath = `${OUTPUT_DIR}/parcels.geojson`;
  const combined: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  };
  await writeFile(outputPath, JSON.stringify(combined));
  console.log(`Wrote ${outputPath} (${allFeatures.length} parcels)`);
}

main().catch(console.error);
