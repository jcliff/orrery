/**
 * Fetch Carson City parcel geometries from ArcGIS REST API.
 *
 * Downloads all parcel polygons with APN field for joining with assessor data.
 *
 * Usage: pnpm --filter fieldline pipeline:carson-city-fetch
 */
import { writeFile, mkdir } from 'node:fs/promises';

const OUTPUT_DIR = new URL('../../data/raw/carson-city', import.meta.url).pathname;
const OUTPUT_PATH = `${OUTPUT_DIR}/parcels.geojson`;

const SERVICE_URL =
  'https://services2.arcgis.com/wEula7SYiezXcdRv/arcgis/rest/services/Parcel_Information_Public_Map_View/FeatureServer/11';

// Rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface EsriGeometry {
  rings?: number[][][];
}

interface EsriFeature {
  attributes: {
    APN?: string;
    APN_D?: string;
    OBJECTID?: number;
    [key: string]: unknown;
  };
  geometry: EsriGeometry;
}

interface EsriResponse {
  features: EsriFeature[];
  exceededTransferLimit?: boolean;
}

/**
 * Convert ESRI JSON geometry to GeoJSON
 */
function esriToGeoJSON(
  esriFeature: EsriFeature
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const { attributes, geometry } = esriFeature;

  if (!geometry || !geometry.rings) return null;

  // Determine APN - try APN first, then APN_D
  const apn = attributes.APN || attributes.APN_D || '';

  const properties: GeoJSON.GeoJsonProperties = {
    APN: apn,
    OBJECTID: attributes.OBJECTID,
  };

  // ESRI rings with same winding = MultiPolygon, different winding = holes
  // For simplicity, if there's only one ring, it's a Polygon
  // If multiple rings, treat as MultiPolygon (may need more sophisticated handling)
  if (geometry.rings.length === 1) {
    return {
      type: 'Feature',
      properties,
      geometry: {
        type: 'Polygon',
        coordinates: geometry.rings,
      },
    };
  }

  // Multiple rings - could be holes or separate polygons
  // For now, treat each ring as its own polygon (simple approach)
  // Note: proper handling would check ring orientation
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: geometry.rings,
    },
  };
}

async function fetchPage(offset: number): Promise<EsriResponse> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'APN,APN_D,OBJECTID',
    f: 'json',
    resultOffset: offset.toString(),
    resultRecordCount: '2000',
    outSR: '4326', // WGS84 for GeoJSON
  });

  const response = await fetch(`${SERVICE_URL}/query?${params}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<EsriResponse>;
}

async function main() {
  console.log('Carson City Parcel Fetch');
  console.log('========================\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  // First, get total count
  const countParams = new URLSearchParams({
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });

  const countResponse = await fetch(`${SERVICE_URL}/query?${countParams}`);
  const countData = (await countResponse.json()) as { count: number };
  console.log(`Total parcels: ${countData.count}`);

  // Fetch all parcels with pagination
  const allFeatures: GeoJSON.Feature[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching from offset ${offset}...`);

    const response = await fetchPage(offset);
    const pageFeatures = response.features
      .map(esriToGeoJSON)
      .filter((f): f is GeoJSON.Feature => f !== null);

    allFeatures.push(...pageFeatures);
    console.log(
      `  Got ${response.features.length} features, converted ${pageFeatures.length}`
    );

    hasMore =
      response.exceededTransferLimit === true || response.features.length >= 2000;
    offset += response.features.length;

    // Rate limit
    if (hasMore) await sleep(200);
  }

  console.log(`\nTotal features collected: ${allFeatures.length}`);

  // Write GeoJSON output
  const geoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(geoJSON));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch(console.error);
