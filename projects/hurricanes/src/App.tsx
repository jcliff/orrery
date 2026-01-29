import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Timeline, filterByTime, type TemporalFeatureCollection } from 'chrona';
import { TimelineControls } from './components/TimelineControls';

const SEGMENTS_URL = '/segments.geojson';
const POINTS_URL = '/points.geojson';

interface PointFeature {
  type: 'Feature';
  properties: {
    stormId: string;
    stormName: string | null;
    timestamp: string;
    wind: number;
    category: number;
    color: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pulseAnimation = useRef<number | null>(null);
  const [segmentsData, setSegmentsData] = useState<TemporalFeatureCollection | null>(null);
  const [pointsData, setPointsData] = useState<PointFeature[] | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1941, 1970]);

  // Create timeline once we have data
  const timeline = useMemo(() => {
    if (!segmentsData) return null;
    // Default to a generation (1941-1970), only animate hurricane season (Jun-Nov)
    return new Timeline({
      start: new Date('1941-06-01'),
      end: new Date('1971-01-01'),
      speed: 86400 * 30, // 1 month/sec - slower default
      seasonMonths: [5, 10], // Jun (5) through Nov (10), 0-indexed
    });
  }, [segmentsData]);

  // Subscribe to timeline ticks
  useEffect(() => {
    if (!timeline) return;

    const handleTick = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCurrentTime(detail.currentTime);
    };

    timeline.addEventListener('tick', handleTick);
    // Initialize with start time
    setCurrentTime(timeline.start);

    return () => {
      timeline.removeEventListener('tick', handleTick);
      timeline.destroy();
    };
  }, [timeline]);

  // Load segments and points data
  useEffect(() => {
    fetch(SEGMENTS_URL)
      .then((res) => res.json())
      .then((data) => setSegmentsData(data as TemporalFeatureCollection));

    fetch(POINTS_URL)
      .then((res) => res.json())
      .then((data) => setPointsData((data as { features: PointFeature[] }).features));
  }, []);

  // Filter segments based on current time AND year range
  const filteredSegments = useMemo(() => {
    if (!segmentsData || !currentTime) return null;

    // First filter by time (cumulative)
    const timeFiltered = filterByTime(segmentsData, currentTime, { mode: 'cumulative' });

    // Then filter by year range
    const [startYear, endYear] = yearRange;
    return {
      ...timeFiltered,
      features: timeFiltered.features.filter((f) => {
        const year = f.properties.year as number;
        return year >= startYear && year <= endYear;
      }),
    };
  }, [segmentsData, currentTime, yearRange]);

  const handleYearRangeChange = useCallback((start: number, end: number) => {
    setYearRange([start, end]);
  }, []);

  // Compute active storm positions (current position of storms that are ongoing)
  const activeStormPositions = useMemo(() => {
    if (!pointsData || !currentTime) return null;

    const currentMs = currentTime.getTime();
    const [startYear, endYear] = yearRange;

    // Group points by storm
    const stormPoints = new Map<string, PointFeature[]>();
    for (const point of pointsData) {
      const year = new Date(point.properties.timestamp).getFullYear();
      if (year < startYear || year > endYear) continue;

      const id = point.properties.stormId;
      if (!stormPoints.has(id)) {
        stormPoints.set(id, []);
      }
      stormPoints.get(id)!.push(point);
    }

    // For each storm, find if it's active and get current position
    const activePositions: PointFeature[] = [];

    for (const [, points] of stormPoints) {
      // Points are in chronological order
      const firstTime = new Date(points[0].properties.timestamp).getTime();
      const lastTime = new Date(points[points.length - 1].properties.timestamp).getTime();

      // Storm is active if current time is within its lifespan
      if (currentMs >= firstTime && currentMs <= lastTime) {
        // Find the most recent point at or before current time
        let currentPoint = points[0];
        for (const point of points) {
          const pointTime = new Date(point.properties.timestamp).getTime();
          if (pointTime <= currentMs) {
            currentPoint = point;
          } else {
            break;
          }
        }
        activePositions.push(currentPoint);
      }
    }

    return {
      type: 'FeatureCollection' as const,
      features: activePositions,
    };
  }, [pointsData, currentTime, yearRange]);

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [-60, 25],
      zoom: 3,
    });

    map.current.on('load', () => {
      if (!map.current) return;

      // Add empty source - will be updated when data loads
      map.current.addSource('hurricane-tracks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Add tracks layer with color based on category
      map.current.addLayer({
        id: 'hurricane-tracks-layer',
        type: 'line',
        source: 'hurricane-tracks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'interpolate',
            ['linear'],
            ['get', 'category'],
            0, 0.5,
            1, 1,
            2, 1.5,
            3, 2,
            4, 2.5,
            5, 3,
          ],
          'line-opacity': 0.6,
        },
      });

      // Add hover effect
      map.current.on('mouseenter', 'hurricane-tracks-layer', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'hurricane-tracks-layer', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      // Add click popup
      map.current.on('click', 'hurricane-tracks-layer', (e) => {
        if (!e.features || !e.features[0] || !map.current) return;

        const props = e.features[0].properties;
        const name = props.stormName || 'Unnamed';
        const year = props.year;
        const category = props.category;
        const wind = props.wind;

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            <strong>${name} (${year})</strong><br/>
            Category: ${category}<br/>
            Wind: ${wind} kt
          `
          )
          .addTo(map.current);
      });

      // Add source for active storm positions
      map.current.addSource('active-storms', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Outer pulse ring (animated)
      map.current.addLayer({
        id: 'active-storms-pulse',
        type: 'circle',
        source: 'active-storms',
        paint: {
          'circle-radius': 20,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.3,
          'circle-stroke-width': 0,
        },
      });

      // Inner solid dot
      map.current.addLayer({
        id: 'active-storms-dot',
        type: 'circle',
        source: 'active-storms',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'category'],
            0, 6,
            1, 7,
            2, 8,
            3, 9,
            4, 10,
            5, 12,
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 1,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'white',
        },
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update map data when filtered segments change
  useEffect(() => {
    if (!map.current || !filteredSegments) return;

    const source = map.current.getSource('hurricane-tracks') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(filteredSegments as GeoJSON.FeatureCollection);
    }
  }, [filteredSegments]);

  // Update active storm positions and run pulse animation
  useEffect(() => {
    if (!map.current || !activeStormPositions) return;

    const source = map.current.getSource('active-storms') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeStormPositions as GeoJSON.FeatureCollection);
    }

    // Pulse animation
    let startTime = performance.now();

    const animatePulse = () => {
      if (!map.current) return;

      const elapsed = performance.now() - startTime;
      const t = (elapsed % 1500) / 1500; // 1.5 second cycle
      const pulseRadius = 12 + Math.sin(t * Math.PI * 2) * 10; // 12-22 radius
      const pulseOpacity = 0.4 - t * 0.3; // Fade out as it expands

      map.current.setPaintProperty('active-storms-pulse', 'circle-radius', pulseRadius);
      map.current.setPaintProperty('active-storms-pulse', 'circle-opacity', Math.max(0.1, pulseOpacity));

      pulseAnimation.current = requestAnimationFrame(animatePulse);
    };

    animatePulse();

    return () => {
      if (pulseAnimation.current) {
        cancelAnimationFrame(pulseAnimation.current);
      }
    };
  }, [activeStormPositions]);

  // Count unique storms from segments
  const stormCount = useMemo(() => {
    if (!filteredSegments) return 0;
    const stormIds = new Set(filteredSegments.features.map(f => f.properties.stormId));
    return stormIds.size;
  }, [filteredSegments]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Title */}
      <div style={styles.title}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Atlantic Hurricane Tracks</h1>
        <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
          {stormCount.toLocaleString()} storms shown
        </p>
      </div>

      {/* Legend */}
      <Legend />

      {/* Timeline Controls */}
      {timeline && (
        <TimelineControls
          timeline={timeline}
          onYearRangeChange={handleYearRangeChange}
        />
      )}
    </div>
  );
}

function Legend() {
  const categories = [
    { label: 'TD/TS', color: '#6ec4e8' },
    { label: 'Cat 1', color: '#ffe066' },
    { label: 'Cat 2', color: '#ffb347' },
    { label: 'Cat 3', color: '#ff6b6b' },
    { label: 'Cat 4', color: '#d63031' },
    { label: 'Cat 5', color: '#6c3483' },
  ];

  return (
    <div style={styles.legend}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Intensity</div>
      {categories.map(({ label, color }) => (
        <div
          key={label}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
        >
          <div style={{ width: 20, height: 3, background: color, borderRadius: 2 }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    position: 'absolute',
    top: 16,
    left: 16,
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '12px 16px',
    borderRadius: 8,
    fontFamily: 'system-ui, sans-serif',
  },
  legend: {
    position: 'absolute',
    top: 100,
    left: 16,
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '12px 16px',
    borderRadius: 8,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
  },
};
