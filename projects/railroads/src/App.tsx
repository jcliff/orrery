import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Timeline, filterByTime, type TemporalFeatureCollection } from 'chrona';
import { TimelineControls } from './components/TimelineControls';

const SEGMENTS_URL = '/segments.geojson';

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [segmentsData, setSegmentsData] = useState<TemporalFeatureCollection | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1830, 1880]);
  const [accumulatePaths, setAccumulatePaths] = useState(true);

  // Create timeline once we have data
  const timeline = useMemo(() => {
    if (!segmentsData) return null;
    return new Timeline({
      start: new Date('1830-01-01'),
      end: new Date('1917-01-01'),
      speed: 86400 * 365, // 1 year/sec
    });
  }, [segmentsData]);

  // Subscribe to timeline ticks (throttled to 100ms for performance)
  useEffect(() => {
    if (!timeline) return;

    let lastUpdate = 0;
    const THROTTLE_MS = 100;

    const handleTick = (e: Event) => {
      const now = Date.now();
      if (now - lastUpdate < THROTTLE_MS) return;
      lastUpdate = now;

      const detail = (e as CustomEvent).detail;
      setCurrentTime(detail.currentTime);
    };

    timeline.addEventListener('tick', handleTick);
    setCurrentTime(timeline.start);

    return () => {
      timeline.removeEventListener('tick', handleTick);
      timeline.destroy();
    };
  }, [timeline]);

  // Load segments data
  useEffect(() => {
    fetch(SEGMENTS_URL)
      .then((res) => res.json())
      .then((data) => setSegmentsData(data as TemporalFeatureCollection));
  }, []);

  // Filter segments based on current time AND year range
  const filteredSegments = useMemo(() => {
    if (!segmentsData || !currentTime) return null;

    const currentMs = currentTime.getTime();
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const FIVE_YEARS_MS = 5 * ONE_YEAR_MS;

    const timeFiltered = filterByTime(segmentsData, currentTime, { mode: 'cumulative' });

    const [startYear, endYear] = yearRange;

    const features = timeFiltered.features
      .filter((f) => {
        const year = f.properties.year as number;
        if (year < startYear || year > endYear) return false;

        if (!accumulatePaths) {
          const startTime = new Date(f.properties.startTime as string).getTime();
          const age = currentMs - startTime;
          if (age > FIVE_YEARS_MS) return false;
        }

        return true;
      })
      .map((f) => {
        let opacity = 0.7;

        if (!accumulatePaths) {
          const startTime = new Date(f.properties.startTime as string).getTime();
          const age = currentMs - startTime;

          if (age <= ONE_YEAR_MS) {
            opacity = 0.9;
          } else {
            const fadeProgress = (age - ONE_YEAR_MS) / (FIVE_YEARS_MS - ONE_YEAR_MS);
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
      type: 'FeatureCollection' as const,
      features,
    };
  }, [segmentsData, currentTime, yearRange, accumulatePaths]);

  const handleYearRangeChange = useCallback((start: number, end: number) => {
    setYearRange([start, end]);
  }, []);

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
              '&copy; OpenStreetMap &copy; CARTO',
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
      center: [-98, 39], // Center of continental US
      zoom: 4,
    });

    map.current.on('load', () => {
      if (!map.current) return;

      map.current.addSource('railroad-tracks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.current.addLayer({
        id: 'railroad-tracks-layer',
        type: 'line',
        source: 'railroad-tracks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': ['get', 'opacity'],
        },
      });

      map.current.on('mouseenter', 'railroad-tracks-layer', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'railroad-tracks-layer', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      map.current.on('click', 'railroad-tracks-layer', (e) => {
        if (!e.features || !e.features[0] || !map.current) return;

        const props = e.features[0].properties;
        const name = props.name || 'Unknown Railroad';
        const year = props.year;
        const state = props.state;
        const miles = props.miles?.toFixed(1);

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            <strong>${name}</strong><br/>
            Opened: ${year}<br/>
            State: ${state}<br/>
            ${miles ? `Length: ${miles} mi` : ''}
          `
          )
          .addTo(map.current);
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update map data
  useEffect(() => {
    if (!map.current || !filteredSegments) return;

    const source = map.current.getSource('railroad-tracks') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(filteredSegments as GeoJSON.FeatureCollection);
    }
  }, [filteredSegments]);

  const segmentCount = filteredSegments?.features.length ?? 0;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      <div style={styles.title}>
        <h1 style={{ margin: 0, fontSize: 18 }}>US Railroad Development</h1>
        <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
          {segmentCount.toLocaleString()} track segments shown
        </p>
      </div>

      <Legend />

      {timeline && (
        <TimelineControls
          timeline={timeline}
          minYear={1830}
          maxYear={1916}
          onYearRangeChange={handleYearRangeChange}
          accumulatePaths={accumulatePaths}
          onAccumulatePathsChange={setAccumulatePaths}
        />
      )}
    </div>
  );
}

function Legend() {
  const eras = [
    { label: 'Pre-1850', color: '#e74c3c' },
    { label: '1850s', color: '#e67e22' },
    { label: '1860s', color: '#f39c12' },
    { label: '1870s', color: '#27ae60' },
    { label: '1880s', color: '#3498db' },
    { label: '1890s', color: '#9b59b6' },
    { label: '1900+', color: '#1abc9c' },
  ];

  return (
    <div style={styles.legend}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Era</div>
      {eras.map(({ label, color }) => (
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
