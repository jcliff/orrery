import { useEffect, useState, useCallback, useRef } from 'react';
import { filterByTime, type TemporalFeatureCollection } from '../core/temporal-filter';
import type { VisualizationConfig, DataSource, Bounds } from '../visualizations/types';

interface LoadedData {
  [sourceId: string]: TemporalFeatureCollection | null;
}

interface LoadingState {
  [sourceId: string]: boolean;
}

interface UseViewportDataResult {
  data: LoadedData;
  loading: boolean;
  error: string | null;
  loadedRegions: Set<string>;
  filterData: (
    sourceId: string,
    currentTime: Date,
    yearRange: [number, number],
    accumulateMode: boolean
  ) => TemporalFeatureCollection | null;
  loadRegion: (regionId: string) => Promise<void>;
}

/**
 * Check if two bounding boxes intersect.
 */
function boundsIntersect(a: Bounds, b: Bounds): boolean {
  // Bounds are [west, south, east, north]
  const [aWest, aSouth, aEast, aNorth] = a;
  const [bWest, bSouth, bEast, bNorth] = b;

  return !(
    aEast < bWest ||
    aWest > bEast ||
    aNorth < bSouth ||
    aSouth > bNorth
  );
}

/**
 * Expand bounds by a factor (for preloading adjacent regions).
 */
function expandBounds(bounds: Bounds, factor: number = 0.5): Bounds {
  const [west, south, east, north] = bounds;
  const width = east - west;
  const height = north - south;
  const expandW = width * factor;
  const expandH = height * factor;

  return [
    west - expandW,
    south - expandH,
    east + expandW,
    north + expandH,
  ];
}

/**
 * Hook for viewport-aware data loading.
 * Only loads data for regions that intersect with the current viewport.
 */
export function useViewportData(config: VisualizationConfig): UseViewportDataResult {
  const [data, setData] = useState<LoadedData>({});
  const [loadingState, setLoadingState] = useState<LoadingState>({});
  const [error, setError] = useState<string | null>(null);
  const [loadedRegions, setLoadedRegions] = useState<Set<string>>(new Set());

  // Track sources that have been loaded or are loading
  const loadingRef = useRef<Set<string>>(new Set());

  // Check if any source is still loading
  const loading = Object.values(loadingState).some((v) => v);

  // Get sources that need loading based on viewport
  const getSourcesForViewport = useCallback(
    (viewportBounds: Bounds): DataSource[] => {
      const expandedViewport = expandBounds(viewportBounds, 0.3);

      return config.sources.filter((source) => {
        if (source.type !== 'geojson') return false;

        // If source has no bounds, it's global (always load)
        if (!source.bounds) return true;

        // Check if source bounds intersect viewport
        return boundsIntersect(source.bounds, expandedViewport);
      });
    },
    [config.sources]
  );

  // Load a specific source
  const loadSource = useCallback(
    async (source: DataSource): Promise<void> => {
      if (loadingRef.current.has(source.id)) return;
      loadingRef.current.add(source.id);

      setLoadingState((prev) => ({ ...prev, [source.id]: true }));

      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`Failed to load ${source.url}: ${response.status}`);
        }
        const json = await response.json();

        setData((prev) => ({
          ...prev,
          [source.id]: json as TemporalFeatureCollection,
        }));

        if (source.region) {
          setLoadedRegions((prev) => new Set([...prev, source.region!]));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingState((prev) => ({ ...prev, [source.id]: false }));
      }
    },
    []
  );

  // Load sources for a given viewport
  const loadForViewport = useCallback(
    async (viewportBounds: Bounds): Promise<void> => {
      const sources = getSourcesForViewport(viewportBounds);

      await Promise.all(
        sources
          .filter((s) => !loadingRef.current.has(s.id))
          .map((s) => loadSource(s))
      );
    },
    [getSourcesForViewport, loadSource]
  );

  // Load a specific region by ID
  const loadRegion = useCallback(
    async (regionId: string): Promise<void> => {
      const sources = config.sources.filter(
        (s) => s.type === 'geojson' && s.region === regionId
      );

      await Promise.all(
        sources
          .filter((s) => !loadingRef.current.has(s.id))
          .map((s) => loadSource(s))
      );
    },
    [config.sources, loadSource]
  );

  // Initial load: load sources without region constraints or default region
  useEffect(() => {
    const globalSources = config.sources.filter(
      (s) => s.type === 'geojson' && !s.region && !s.bounds
    );

    Promise.all(
      globalSources
        .filter((s) => !loadingRef.current.has(s.id))
        .map((s) => loadSource(s))
    ).catch((err) => setError(err.message));
  }, [config.sources, loadSource]);

  // Filter function for GeoJSON data
  const filterData = useCallback(
    (
      sourceId: string,
      currentTime: Date,
      yearRange: [number, number],
      accumulateMode: boolean
    ): TemporalFeatureCollection | null => {
      const sourceData = data[sourceId];
      if (!sourceData || !currentTime) return null;

      // Find the layer config for this source to get fade settings
      const layerConfig = config.layers.find((l) => l.sourceId === sourceId);
      const fadeYears = layerConfig?.temporal?.fadeYears ?? 20;
      const fadeMonths = layerConfig?.temporal?.fadeMonths;

      const currentMs = currentTime.getTime();
      const fadeMs = fadeMonths
        ? fadeMonths * 30 * 24 * 60 * 60 * 1000
        : fadeYears * 365 * 24 * 60 * 60 * 1000;
      const halfFadeMs = fadeMs / 2;

      // First filter by cumulative time
      const timeFiltered = filterByTime(sourceData, currentTime, { mode: 'cumulative' });

      const [startYear, endYear] = yearRange;

      const features = timeFiltered.features
        .filter((f) => {
          const year = f.properties.year as number;
          if (year < startYear || year > endYear) return false;

          if (!accumulateMode) {
            const timeStr = (f.properties.endTime || f.properties.startTime) as string;
            const featureTime = new Date(timeStr).getTime();
            const age = currentMs - featureTime;
            if (age > fadeMs) return false;
          }

          return true;
        })
        .map((f) => {
          let opacity = 0.7;

          if (!accumulateMode) {
            const timeStr = (f.properties.endTime || f.properties.startTime) as string;
            const featureTime = new Date(timeStr).getTime();
            const age = currentMs - featureTime;

            if (age <= halfFadeMs) {
              opacity = 0.9;
            } else {
              const fadeProgress = (age - halfFadeMs) / (fadeMs - halfFadeMs);
              opacity = 0.9 * (1 - fadeProgress);
            }
          }

          return {
            ...f,
            properties: {
              ...f.properties,
              opacity,
            },
          };
        });

      return {
        type: 'FeatureCollection',
        features,
      };
    },
    [data, config.layers]
  );

  return {
    data,
    loading,
    error,
    loadedRegions,
    filterData,
    loadRegion,
  };
}

/**
 * Hook to track map viewport and trigger lazy loading.
 */
export function useViewportTracking(
  map: maplibregl.Map | null,
  onViewportChange: (bounds: Bounds) => void,
  debounceMs: number = 300
): void {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;

    const handleMoveEnd = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        const bounds = map.getBounds();
        onViewportChange([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ]);
      }, debounceMs);
    };

    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleMoveEnd);

    // Trigger initial load
    handleMoveEnd();

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleMoveEnd);
    };
  }, [map, onViewportChange, debounceMs]);
}
