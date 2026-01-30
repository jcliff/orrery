import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import type { VisualizationConfig, LayerConfig } from '../visualizations/types';
import {
  createTemporalFilterWithRange,
  createOpacityExpression,
} from '../core/temporal-expression';
import { useTimeline } from '../hooks/useTimeline';
import { useTemporalData } from '../hooks/useTemporalData';
import { TimelineControls } from './TimelineControls';
import { Legend } from './Legend';
import { Title } from './Title';

// Register PMTiles protocol once at module level
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

interface VisualizationViewProps {
  config: VisualizationConfig;
}

export function VisualizationView({ config }: VisualizationViewProps) {
  // Use callback ref pattern to detect when container is mounted
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pulseAnimation = useRef<number | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [yearRange, setYearRange] = useState<[number, number]>(
    config.defaultYearRange || [
      new Date(config.timeRange.start).getFullYear(),
      new Date(config.timeRange.end).getFullYear(),
    ]
  );
  const [accumulatePaths, setAccumulatePaths] = useState(true);

  // Load data
  const { data, loading, error, filterData } = useTemporalData(config);
  // For PMTiles-only configs, data will be empty but we're still "loaded"
  const hasGeoJsonSources = config.sources.some((s) => s.type === 'geojson');
  const dataLoaded = !loading && !error && (!hasGeoJsonSources || Object.keys(data).length > 0);

  // Create timeline
  const { timeline, currentTime } = useTimeline(config, dataLoaded);

  // Track filtered data for hurricane-specific active storms source
  const [activeStormsData, setActiveStormsData] = useState<GeoJSON.FeatureCollection | null>(null);

  // Get year bounds from the actual data (computed once when data loads)
  const computedBounds = useRef<{ minYear: number; maxYear: number } | null>(null);

  const { minYear, maxYear } = useMemo(() => {
    const configMin = new Date(config.timeRange.start).getFullYear();
    const configMax = new Date(config.timeRange.end).getFullYear();

    // Return cached bounds if already computed
    if (computedBounds.current) {
      return computedBounds.current;
    }

    // Check if data is loaded
    const hasData = config.sources.some(
      (s) => s.type === 'geojson' && data[s.id]?.features?.length > 0
    );
    if (!hasData) {
      return { minYear: configMin, maxYear: configMax };
    }

    // Compute bounds from loaded GeoJSON data
    let dataMin = Infinity;
    let dataMax = -Infinity;

    for (const source of config.sources) {
      if (source.type !== 'geojson') continue;
      const sourceData = data[source.id];
      if (!sourceData) continue;

      for (const feature of sourceData.features) {
        const year = feature.properties?.year as number;
        if (typeof year === 'number') {
          if (year < dataMin) dataMin = year;
          if (year > dataMax) dataMax = year;
        }
      }
    }

    // Cache and return the computed bounds
    const bounds = {
      minYear: dataMin !== Infinity ? dataMin : configMin,
      maxYear: dataMax !== -Infinity ? dataMax : configMax,
    };
    computedBounds.current = bounds;
    return bounds;
  }, [config.timeRange, config.sources, data]);

  const handleYearRangeChange = useCallback((start: number, end: number) => {
    setYearRange([start, end]);
  }, []);

  // Initialize map
  useEffect(() => {
    console.log('Map useEffect running, map.current:', !!map.current, 'container:', !!mapContainer);
    if (map.current || !mapContainer) {
      console.log('Early return - map exists or container not ready');
      return;
    }

    console.log('Initializing map, container dimensions:',
      mapContainer.clientWidth,
      mapContainer.clientHeight);

    map.current = new maplibregl.Map({
      container: mapContainer,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: config.center,
      zoom: config.zoom,
    });

    map.current.on('error', (e) => {
      console.error('Map error:', e);
    });

    map.current.on('load', () => {
      console.log('Map loaded successfully');
      if (!map.current) return;

      // Add sources
      for (const source of config.sources) {
        if (source.type === 'geojson') {
          map.current.addSource(source.id, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        } else if (source.type === 'pmtiles') {
          map.current.addSource(source.id, {
            type: 'vector',
            url: source.url,
          });
        }
      }

      // Special source for hurricane active storms
      if (config.id === 'hurricanes') {
        map.current.addSource('active-storms', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Add layers
      for (const layer of config.layers) {
        const layerSpec: maplibregl.LayerSpecification = {
          id: layer.id,
          type: layer.type as 'circle' | 'line' | 'fill',
          source: layer.sourceId,
          paint: layer.paint as Record<string, unknown>,
        };

        if (layer.sourceLayer) {
          layerSpec['source-layer'] = layer.sourceLayer;
        }
        if (layer.layout) {
          layerSpec.layout = layer.layout;
        }
        if (layer.minzoom !== undefined) {
          layerSpec.minzoom = layer.minzoom;
        }
        if (layer.maxzoom !== undefined) {
          layerSpec.maxzoom = layer.maxzoom;
        }

        map.current.addLayer(layerSpec);
      }

      // Add popup handlers if configured
      if (config.popup) {
        for (const layerId of config.popup.layers) {
          map.current.on('mouseenter', layerId, () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });

          map.current.on('mouseleave', layerId, () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });

          map.current.on('click', layerId, (e) => {
            if (!e.features || !e.features[0] || !map.current) return;

            const props = e.features[0].properties as Record<string, unknown>;
            const html = config.popup!.render(props);

            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map.current);
          });
        }
      }

      setMapLoaded(true);
    });

    return () => {
      if (pulseAnimation.current) {
        cancelAnimationFrame(pulseAnimation.current);
      }
      map.current?.remove();
      map.current = null;
    };
  }, [config, mapContainer]);

  // Update GeoJSON sources when data changes
  useEffect(() => {
    console.log('Data update effect:', { mapExists: !!map.current, mapLoaded, currentTime: currentTime?.toISOString() });
    if (!map.current || !mapLoaded || !currentTime) return;

    for (const source of config.sources) {
      if (source.type !== 'geojson') continue;

      const layerConfig = config.layers.find((l) => l.sourceId === source.id);
      if (!layerConfig) continue;

      // Skip if this layer uses GPU filters
      if (layerConfig.temporal?.useGpuFilter) continue;

      const filtered = filterData(source.id, currentTime, yearRange, accumulatePaths);
      console.log('Filtered data for', source.id, ':', filtered?.features.length, 'features');
      if (!filtered) continue;

      const mapSource = map.current.getSource(source.id) as maplibregl.GeoJSONSource;
      if (mapSource) {
        console.log('Setting data on source', source.id);
        mapSource.setData(filtered);
      } else {
        console.log('Source not found:', source.id);
      }
    }
  }, [config, mapLoaded, currentTime, yearRange, accumulatePaths, filterData]);

  // Update GPU-filtered layers (for PMTiles)
  useEffect(() => {
    if (!map.current || !mapLoaded || !currentTime) return;

    const year = currentTime.getFullYear();

    for (const layer of config.layers) {
      if (!layer.temporal?.useGpuFilter) continue;

      const filter = createTemporalFilterWithRange(year, yearRange, {
        mode: accumulatePaths ? 'cumulative' : 'active',
        fadeYears: layer.temporal.fadeYears ?? 20,
        yearProperty: layer.temporal.yearProperty,
      });

      map.current.setFilter(layer.id, filter);

      // Update opacity for active mode
      if (!accumulatePaths && layer.type === 'circle') {
        map.current.setPaintProperty(
          layer.id,
          'circle-opacity',
          createOpacityExpression(year, layer.temporal.fadeYears ?? 20)
        );
      } else if (layer.type === 'circle') {
        map.current.setPaintProperty(layer.id, 'circle-opacity', 0.8);
      }
    }
  }, [config, mapLoaded, currentTime, yearRange, accumulatePaths]);

  // Hurricane-specific: Compute active storm positions
  useEffect(() => {
    if (config.id !== 'hurricanes' || !data['hurricane-points'] || !currentTime) {
      return;
    }

    const pointsData = data['hurricane-points'];
    const currentMs = currentTime.getTime();
    const [startYear, endYear] = yearRange;

    // Group points by storm
    const stormPoints = new Map<string, Array<{
      timestamp: string;
      stormId: string;
      stormName: string | null;
      wind: number;
      category: number;
      color: string;
      coordinates: [number, number];
    }>>();

    for (const feature of pointsData.features) {
      const props = feature.properties;
      const year = new Date(props.timestamp as string).getFullYear();
      if (year < startYear || year > endYear) continue;

      const id = props.stormId as string;
      if (!stormPoints.has(id)) {
        stormPoints.set(id, []);
      }
      stormPoints.get(id)!.push({
        timestamp: props.timestamp as string,
        stormId: props.stormId as string,
        stormName: props.stormName as string | null,
        wind: props.wind as number,
        category: props.category as number,
        color: props.color as string,
        coordinates: (feature.geometry as { coordinates: [number, number] }).coordinates,
      });
    }

    // Find active storms
    const activePositions: GeoJSON.Feature[] = [];

    for (const [, points] of stormPoints) {
      const firstTime = new Date(points[0].timestamp).getTime();
      const lastTime = new Date(points[points.length - 1].timestamp).getTime();

      if (currentMs >= firstTime && currentMs <= lastTime) {
        let currentPoint = points[0];
        for (const point of points) {
          const pointTime = new Date(point.timestamp).getTime();
          if (pointTime <= currentMs) {
            currentPoint = point;
          } else {
            break;
          }
        }
        activePositions.push({
          type: 'Feature',
          properties: {
            stormId: currentPoint.stormId,
            stormName: currentPoint.stormName,
            wind: currentPoint.wind,
            category: currentPoint.category,
            color: currentPoint.color,
          },
          geometry: {
            type: 'Point',
            coordinates: currentPoint.coordinates,
          },
        });
      }
    }

    const activeData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: activePositions,
    };

    setActiveStormsData(activeData);
  }, [config.id, data, currentTime, yearRange]);

  // Update active storms source
  useEffect(() => {
    if (!map.current || !mapLoaded || !activeStormsData) return;

    const source = map.current.getSource('active-storms') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeStormsData);
    }

    // Pulse animation
    let startTime = performance.now();

    const animatePulse = () => {
      if (!map.current) return;

      const elapsed = performance.now() - startTime;
      const t = (elapsed % 1500) / 1500;
      const pulseRadius = 12 + Math.sin(t * Math.PI * 2) * 10;
      const pulseOpacity = 0.4 - t * 0.3;

      try {
        map.current.setPaintProperty('active-storms-pulse', 'circle-radius', pulseRadius);
        map.current.setPaintProperty('active-storms-pulse', 'circle-opacity', Math.max(0.1, pulseOpacity));
      } catch {
        // Layer might not exist
      }

      pulseAnimation.current = requestAnimationFrame(animatePulse);
    };

    animatePulse();

    return () => {
      if (pulseAnimation.current) {
        cancelAnimationFrame(pulseAnimation.current);
      }
    };
  }, [mapLoaded, activeStormsData]);

  // Count items for display
  const itemCount = useMemo(() => {
    if (!currentTime) return 0;

    // For configs with sumProperty, sum counts from filtered data
    if (config.title.sumProperty) {
      const primarySource = config.sources[0];
      if (primarySource.type !== 'geojson') return 0;

      const filtered = filterData(primarySource.id, currentTime, yearRange, accumulatePaths);
      if (!filtered) return 0;

      return filtered.features.reduce(
        (sum, f) => sum + ((f.properties[config.title.sumProperty!] as number) || 1),
        0
      );
    }

    // For configs with countProperty, count unique values
    if (config.title.countProperty) {
      const primarySource = config.sources[0];
      if (primarySource.type !== 'geojson') return 0;

      const filtered = filterData(primarySource.id, currentTime, yearRange, accumulatePaths);
      if (!filtered) return 0;

      const unique = new Set(
        filtered.features.map((f) => f.properties[config.title.countProperty!] as string)
      );
      return unique.size;
    }

    // Default: count features
    const primarySource = config.sources[0];
    if (primarySource.type !== 'geojson') return 0;

    const filtered = filterData(primarySource.id, currentTime, yearRange, accumulatePaths);
    return filtered?.features.length ?? 0;
  }, [config, currentTime, yearRange, accumulatePaths, filterData]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: 'white' }}>
        Loading data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#ff6b6b' }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={setMapContainer} style={{ width: '100%', height: '100%' }} />

      <Title config={config} count={itemCount} />
      <Legend config={config} />

      {timeline && (
        <TimelineControls
          timeline={timeline}
          config={config}
          minYear={minYear}
          maxYear={maxYear}
          onYearRangeChange={handleYearRangeChange}
          accumulatePaths={accumulatePaths}
          onAccumulatePathsChange={setAccumulatePaths}
        />
      )}
    </div>
  );
}
