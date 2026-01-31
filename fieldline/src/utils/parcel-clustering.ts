/**
 * Parcel clustering utilities for aggregating parcels into visualization-ready format.
 */

// Grid cell size for aggregation (~50m at Nevada/California latitudes)
export const GRID_SIZE = 0.0005;

/**
 * Extract block ID from an APN (Assessor Parcel Number).
 * Uses first two segments separated by '-', or first 6 characters.
 */
export function getBlockId(apn: string | number | null): string {
  if (apn === null || apn === undefined) return 'unknown';
  const str = String(apn);
  const parts = str.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return str.substring(0, 6);
}

/**
 * Get a grid cell key from coordinates.
 * Snaps coordinates to grid cells for spatial grouping.
 */
export function getGridKey(lng: number, lat: number, gridSize = GRID_SIZE): string {
  const gridLng = Math.floor(lng / gridSize) * gridSize;
  const gridLat = Math.floor(lat / gridSize) * gridSize;
  return `${gridLng.toFixed(5)},${gridLat.toFixed(5)}`;
}

/**
 * Get a composite cluster key combining block ID and grid cell.
 */
export function getClusterKey(apn: string | number | null, lng: number, lat: number, gridSize = GRID_SIZE): string {
  return `${getBlockId(apn)}:${getGridKey(lng, lat, gridSize)}`;
}

/**
 * Calculate the centroid of a polygon or multipolygon.
 * Uses simple average of outer ring vertices.
 */
export function getCentroid(geometry: { type: string; coordinates: unknown }): [number, number] {
  let ring: number[][];

  if (geometry.type === 'Polygon') {
    ring = (geometry.coordinates as number[][][])[0];
  } else if (geometry.type === 'MultiPolygon') {
    ring = (geometry.coordinates as number[][][][])[0][0];
  } else if (geometry.type === 'Point') {
    const coords = geometry.coordinates as [number, number];
    return coords;
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / ring.length, sumLat / ring.length];
}

/**
 * Calculate the median of an array of numbers.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Find the dominant value in a record of counts.
 */
export function findDominant<T extends string>(counts: Record<T, number>, defaultValue: T): T {
  let dominant = defaultValue;
  let maxCount = 0;
  for (const [value, count] of Object.entries(counts) as [T, number][]) {
    if (count > maxCount) {
      maxCount = count;
      dominant = value;
    }
  }
  return dominant;
}

/**
 * Cluster state for aggregating parcels.
 */
export interface Cluster {
  blockId: string;
  lngSum: number;
  latSum: number;
  count: number;
  useTypes: Record<string, number>;
  earliestYear: number;
  totalArea: number;
  hasEstimates: boolean;
}

/**
 * Create an empty cluster.
 */
export function createCluster(blockId: string, year: number): Cluster {
  return {
    blockId,
    lngSum: 0,
    latSum: 0,
    count: 0,
    useTypes: {},
    earliestYear: year,
    totalArea: 0,
    hasEstimates: false,
  };
}

/**
 * Add a parcel to a cluster.
 */
export function addToCluster(
  cluster: Cluster,
  lng: number,
  lat: number,
  useLabel: string,
  year: number,
  area: number,
  estimated: boolean
): void {
  cluster.lngSum += lng;
  cluster.latSum += lat;
  cluster.count++;
  cluster.useTypes[useLabel] = (cluster.useTypes[useLabel] || 0) + 1;
  cluster.totalArea += area;
  if (year < cluster.earliestYear) cluster.earliestYear = year;
  if (estimated) cluster.hasEstimates = true;
}
