/**
 * Geospatial utilities for point-in-polygon testing.
 *
 * Uses ray casting algorithm for efficient polygon containment tests.
 * Handles both Polygon and MultiPolygon geometries.
 */

export type Position = [number, number]; // [lng, lat]
export type Ring = Position[];
export type PolygonCoords = Ring[]; // [outer, ...holes]
export type MultiPolygonCoords = PolygonCoords[];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: PolygonCoords;
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: MultiPolygonCoords;
}

export type AnyPolygonGeometry = PolygonGeometry | MultiPolygonGeometry;

/**
 * Ray casting algorithm for point-in-polygon test.
 * Casts a ray from the point to the right and counts edge crossings.
 * Odd number of crossings = inside, even = outside.
 */
function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // Check if ray from point intersects this edge
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is inside a polygon (with holes).
 * Point must be inside outer ring and outside all hole rings.
 */
function pointInPolygon(point: Position, polygon: PolygonCoords): boolean {
  // Must be inside outer ring
  if (!pointInRing(point, polygon[0])) {
    return false;
  }

  // Must be outside all holes
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a point is inside any polygon of a MultiPolygon.
 */
function pointInMultiPolygon(
  point: Position,
  multiPolygon: MultiPolygonCoords
): boolean {
  for (const polygon of multiPolygon) {
    if (pointInPolygon(point, polygon)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a point is inside a geometry (Polygon or MultiPolygon).
 */
export function pointInGeometry(
  point: Position,
  geometry: AnyPolygonGeometry
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(point, geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    return pointInMultiPolygon(point, geometry.coordinates);
  }
  return false;
}

/**
 * Create a reusable containment checker for a geometry.
 * Pre-computes bounding box for fast rejection.
 */
export function createContainmentChecker(geometry: AnyPolygonGeometry): {
  contains: (point: Position) => boolean;
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number };
} {
  // Compute bounding box
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const processRing = (ring: Ring) => {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  };

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      processRing(ring);
    }
  } else {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        processRing(ring);
      }
    }
  }

  const bbox = { minLng, maxLng, minLat, maxLat };

  return {
    bbox,
    contains: (point: Position): boolean => {
      const [lng, lat] = point;

      // Fast bounding box rejection
      if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
        return false;
      }

      return pointInGeometry(point, geometry);
    },
  };
}

/**
 * Batch check many points against a geometry.
 * Returns array of booleans in same order as input points.
 */
export function batchContainmentCheck(
  points: Position[],
  geometry: AnyPolygonGeometry
): boolean[] {
  const checker = createContainmentChecker(geometry);
  return points.map((p) => checker.contains(p));
}
