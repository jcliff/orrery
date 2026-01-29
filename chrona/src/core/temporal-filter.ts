export interface TemporalFeature {
  type: 'Feature';
  properties: {
    startTime?: string;
    endTime?: string;
    [key: string]: unknown;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

export interface TemporalFeatureCollection {
  type: 'FeatureCollection';
  features: TemporalFeature[];
}

export interface FilterOptions {
  /** Include features that have started but not yet ended at the given time */
  mode?: 'active' | 'cumulative';
}

/**
 * Filters a GeoJSON FeatureCollection to include only features
 * that are active at the specified time.
 *
 * Features must have `startTime` and optionally `endTime` properties
 * in ISO 8601 format.
 *
 * @param collection - GeoJSON FeatureCollection with temporal properties
 * @param currentTime - The time to filter by
 * @param options - Filter options
 * @returns Filtered FeatureCollection
 */
export function filterByTime(
  collection: TemporalFeatureCollection,
  currentTime: Date,
  options: FilterOptions = {}
): TemporalFeatureCollection {
  const { mode = 'cumulative' } = options;
  const time = currentTime.getTime();

  const filtered = collection.features.filter((feature) => {
    const { startTime, endTime } = feature.properties;

    // Skip features without temporal data
    if (!startTime) return false;

    const start = new Date(startTime).getTime();

    // Feature hasn't started yet
    if (time < start) return false;

    // In cumulative mode, include all features that have started
    if (mode === 'cumulative') {
      return true;
    }

    // In active mode, exclude features that have ended
    if (endTime) {
      const end = new Date(endTime).getTime();
      if (time > end) return false;
    }

    return true;
  });

  return {
    type: 'FeatureCollection',
    features: filtered,
  };
}

/**
 * Returns the time range covered by a collection's features.
 */
export function getTimeRange(
  collection: TemporalFeatureCollection
): { start: Date; end: Date } | null {
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const feature of collection.features) {
    const { startTime, endTime } = feature.properties;

    if (startTime) {
      const start = new Date(startTime).getTime();
      if (start < minTime) minTime = start;
      if (start > maxTime) maxTime = start;
    }

    if (endTime) {
      const end = new Date(endTime).getTime();
      if (end > maxTime) maxTime = end;
    }
  }

  if (minTime === Infinity || maxTime === -Infinity) {
    return null;
  }

  return {
    start: new Date(minTime),
    end: new Date(maxTime),
  };
}
