import { useEffect, useState, useMemo, useCallback } from 'react';
import { filterByTime, type TemporalFeatureCollection } from '../core/temporal-filter';
import type { VisualizationConfig, DataSource } from '../visualizations/types';

interface LoadedData {
  [sourceId: string]: TemporalFeatureCollection | null;
}

interface UseTemporalDataResult {
  data: LoadedData;
  loading: boolean;
  error: string | null;
  filterData: (
    sourceId: string,
    currentTime: Date,
    yearRange: [number, number],
    accumulateMode: boolean
  ) => TemporalFeatureCollection | null;
}

export function useTemporalData(config: VisualizationConfig): UseTemporalDataResult {
  const [data, setData] = useState<LoadedData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all GeoJSON sources
  useEffect(() => {
    const geojsonSources = config.sources.filter((s) => s.type === 'geojson');

    if (geojsonSources.length === 0) {
      setLoading(false);
      return;
    }

    Promise.all(
      geojsonSources.map(async (source) => {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`Failed to load ${source.url}: ${response.status}`);
        }
        const json = await response.json();
        return { id: source.id, data: json as TemporalFeatureCollection };
      })
    )
      .then((results) => {
        const loadedData: LoadedData = {};
        for (const result of results) {
          loadedData[result.id] = result.data;
        }
        setData(loadedData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [config.sources]);

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
            // Use startTime or endTime depending on what's available
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

  return { data, loading, error, filterData };
}
