/**
 * Synthetic date generation for San Francisco buildings.
 *
 * Generates plausible construction years for buildings without accurate
 * records, using historical development patterns and 1906 fire zone data.
 */

import { readFile } from 'node:fs/promises';
import {
  DEVELOPMENT_ZONES,
  DEFAULT_ZONE,
  buildNeighborhoodZoneMap,
  type DevelopmentZone,
} from './sf-development-zones.js';
import {
  createContainmentChecker,
  type AnyPolygonGeometry,
  type Position,
} from '../geo/point-in-polygon.js';

/** Result of synthetic date generation */
export interface SyntheticDateResult {
  year: number;
  estimated: boolean;
  inFireZone: boolean;
  method: string;
  zone: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Parameters for generating a synthetic date */
export interface SyntheticDateParams {
  lng: number;
  lat: number;
  neighborhood: string;
  knownYear?: number; // If available, validate/adjust instead of generate
}

/** Historical centers that influenced development timing */
interface HistoricalCenter {
  name: string;
  lng: number;
  lat: number;
  foundedYear: number;
  influenceRadiusKm: number;
}

const HISTORICAL_CENTERS: HistoricalCenter[] = [
  {
    name: 'Portsmouth Square',
    lng: -122.405,
    lat: 37.7952,
    foundedYear: 1835,
    influenceRadiusKm: 2.0,
  },
  {
    name: 'Mission Dolores',
    lng: -122.427,
    lat: 37.76,
    foundedYear: 1776,
    influenceRadiusKm: 1.5,
  },
  {
    name: 'Market & Powell',
    lng: -122.4078,
    lat: 37.7848,
    foundedYear: 1860,
    influenceRadiusKm: 2.5,
  },
];

/**
 * Haversine distance between two points in kilometers.
 */
function haversineDistance(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Simple beta distribution sampler using the Kumaraswamy approximation.
 * For alpha=2, beta=3: mean ~0.4, mode ~0.25 (front-weighted)
 */
function sampleBeta(alpha: number, beta: number): number {
  const u = Math.random();
  // Kumaraswamy approximation: works well for alpha, beta >= 1
  return Math.pow(1 - Math.pow(1 - u, 1 / beta), 1 / alpha);
}

/**
 * Random integer in range [min, max] inclusive.
 */
function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Sample from a zone's development curve.
 * Uses beta distribution to weight toward rapid growth period.
 */
function sampleDevelopmentCurve(zone: DevelopmentZone): number {
  const { firstDeveloped, rapidGrowthStart, rapidGrowthEnd, builtOut } = zone;

  // Beta(2,3) gives front-weighted distribution
  const beta = sampleBeta(2, 3);

  // Map to development timeline:
  // 10% before rapid growth, 70% during rapid growth, 20% after
  if (beta < 0.1) {
    // Early development
    const t = beta / 0.1;
    return firstDeveloped + (rapidGrowthStart - firstDeveloped) * t;
  } else if (beta < 0.8) {
    // Rapid growth period (most buildings)
    const t = (beta - 0.1) / 0.7;
    return rapidGrowthStart + (rapidGrowthEnd - rapidGrowthStart) * t;
  } else {
    // Late development
    const t = (beta - 0.8) / 0.2;
    return rapidGrowthEnd + (builtOut - rapidGrowthEnd) * t;
  }
}

/**
 * Calculate distance-based modifier for historical centers.
 * Buildings closer to centers developed earlier.
 */
function calculateDistanceModifier(lng: number, lat: number): number {
  let minModifier = 0;

  for (const center of HISTORICAL_CENTERS) {
    const distKm = haversineDistance(lng, lat, center.lng, center.lat);

    if (distKm < center.influenceRadiusKm) {
      // Within influence radius: earlier development (-5 to 0 years)
      const proximity = 1 - distKm / center.influenceRadiusKm;
      const modifier = -5 * proximity;
      minModifier = Math.min(minModifier, modifier);
    }
  }

  return minModifier;
}

/**
 * Generate a rebuild year for buildings in the 1906 fire zone.
 * Most rebuilding happened 1906-1915, weighted toward early years.
 */
function generateRebuildYear(): number {
  const r = Math.random();
  // 60% rebuilt 1906-1910, 30% 1910-1915, 10% 1915-1920
  if (r < 0.6) return randomInt(1906, 1910);
  if (r < 0.9) return randomInt(1910, 1915);
  return randomInt(1915, 1920);
}

/**
 * Creates a synthetic date generator with loaded fire boundary.
 */
export async function createSyntheticDateGenerator(fireBoundaryPath: string) {
  // Load fire boundary
  const fireBoundaryJson = await readFile(fireBoundaryPath, 'utf-8');
  const fireBoundary = JSON.parse(fireBoundaryJson);

  let fireGeometry: AnyPolygonGeometry;
  if (fireBoundary.type === 'Feature') {
    fireGeometry = fireBoundary.geometry;
  } else if (fireBoundary.type === 'FeatureCollection') {
    fireGeometry = fireBoundary.features[0].geometry;
  } else {
    fireGeometry = fireBoundary;
  }

  const fireChecker = createContainmentChecker(fireGeometry);
  const neighborhoodZoneMap = buildNeighborhoodZoneMap();

  console.log(
    `Loaded 1906 fire boundary (bbox: ${fireChecker.bbox.minLng.toFixed(4)}, ${fireChecker.bbox.minLat.toFixed(4)} to ${fireChecker.bbox.maxLng.toFixed(4)}, ${fireChecker.bbox.maxLat.toFixed(4)})`
  );

  /**
   * Check if a point is in the 1906 fire zone.
   */
  function isInFireZone(lng: number, lat: number): boolean {
    return fireChecker.contains([lng, lat] as Position);
  }

  /**
   * Get development zone for a neighborhood.
   */
  function getZone(neighborhood: string): DevelopmentZone {
    return neighborhoodZoneMap.get(neighborhood) || DEFAULT_ZONE;
  }

  /**
   * Generate or validate a construction year for a building.
   */
  function generateDate(params: SyntheticDateParams): SyntheticDateResult {
    const { lng, lat, neighborhood, knownYear } = params;

    const zone = getZone(neighborhood);
    const inFireZone = isInFireZone(lng, lat);

    // If we have a known year, validate and possibly adjust
    if (knownYear !== undefined && knownYear >= 1800 && knownYear <= 2100) {
      // Check for suspicious pre-1906 dates in fire zone
      if (inFireZone && knownYear < 1906) {
        // This is suspicious - building should have burned
        // Keep the data but flag it
        return {
          year: knownYear,
          estimated: false,
          inFireZone,
          method: 'known_suspicious_pre_fire',
          zone: zone.id,
          confidence: 'low',
        };
      }

      return {
        year: knownYear,
        estimated: false,
        inFireZone,
        method: 'known',
        zone: zone.id,
        confidence: 'high',
      };
    }

    // Generate synthetic date
    let baseYear = sampleDevelopmentCurve(zone);

    // Apply distance modifier from historical centers
    const distanceModifier = calculateDistanceModifier(lng, lat);
    baseYear += distanceModifier;

    // Apply terrain penalty (hills developed later)
    if (zone.terrain === 'steep_hill') {
      baseYear += randomInt(3, 8);
    } else if (zone.terrain === 'moderate_hill') {
      baseYear += randomInt(1, 4);
    }

    // Apply fire zone rules
    let method = `zone_${zone.id}`;
    let isFireRebuild = false;
    if (inFireZone && baseYear < 1906) {
      baseYear = generateRebuildYear();
      method = `zone_${zone.id}_fire_rebuild`;
      isFireRebuild = true;
    }

    // Add small jitter for visual variety
    baseYear += randomInt(-2, 2);

    // Clamp to appropriate bounds
    // Fire rebuilds should stay in 1906-1925 range, not be clamped to pre-fire zone bounds
    if (isFireRebuild) {
      baseYear = Math.max(1906, Math.min(1925, Math.round(baseYear)));
    } else {
      baseYear = Math.max(
        zone.firstDeveloped,
        Math.min(zone.builtOut, Math.round(baseYear))
      );
    }

    return {
      year: baseYear,
      estimated: true,
      inFireZone,
      method,
      zone: zone.id,
      confidence: zone.confidence,
    };
  }

  /**
   * Get statistics about fire zone coverage.
   */
  function getStats() {
    return {
      fireBoundaryBbox: fireChecker.bbox,
      zoneCount: DEVELOPMENT_ZONES.length,
      neighborhoodsMapped: neighborhoodZoneMap.size,
    };
  }

  return {
    generateDate,
    isInFireZone,
    getZone,
    getStats,
  };
}

export type SyntheticDateGenerator = Awaited<
  ReturnType<typeof createSyntheticDateGenerator>
>;
