import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Timeline, filterByTime, type TemporalFeatureCollection } from 'chrona';
import { TimelineControls } from './components/TimelineControls';

const BUILDINGS_URL = '/buildings.geojson';

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [buildingsData, setBuildingsData] = useState<TemporalFeatureCollection | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1848, 1950]);
  const [accumulatePaths, setAccumulatePaths] = useState(true);

  // Create timeline once we have data
  const timeline = useMemo(() => {
    if (!buildingsData) return null;
    return new Timeline({
      start: new Date('1848-01-01'),
      end: new Date('2023-01-01'),
      speed: 86400 * 365 * 2, // 2 years/sec
    });
  }, [buildingsData]);

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

  // Load buildings data
  useEffect(() => {
    fetch(BUILDINGS_URL)
      .then((res) => res.json())
      .then((data) => setBuildingsData(data as TemporalFeatureCollection));
  }, []);

  // Filter buildings based on current time AND year range
  const filteredBuildings = useMemo(() => {
    if (!buildingsData || !currentTime) return null;

    const currentMs = currentTime.getTime();
    const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
    const TWENTY_YEARS_MS = 20 * 365 * 24 * 60 * 60 * 1000;

    const timeFiltered = filterByTime(buildingsData, currentTime, { mode: 'cumulative' });

    const [startYear, endYear] = yearRange;

    const features = timeFiltered.features
      .filter((f) => {
        const year = f.properties.year as number;
        if (year < startYear || year > endYear) return false;

        if (!accumulatePaths) {
          const startTime = new Date(f.properties.startTime as string).getTime();
          const age = currentMs - startTime;
          if (age > TWENTY_YEARS_MS) return false;
        }

        return true;
      })
      .map((f) => {
        let opacity = 0.8;

        if (!accumulatePaths) {
          const startTime = new Date(f.properties.startTime as string).getTime();
          const age = currentMs - startTime;

          if (age <= TEN_YEARS_MS) {
            opacity = 0.9;
          } else {
            const fadeProgress = (age - TEN_YEARS_MS) / (TWENTY_YEARS_MS - TEN_YEARS_MS);
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
  }, [buildingsData, currentTime, yearRange, accumulatePaths]);

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
            attribution: '&copy; OpenStreetMap &copy; CARTO',
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
      center: [-122.4194, 37.7749], // San Francisco
      zoom: 12,
    });

    map.current.on('load', () => {
      if (!map.current) return;

      map.current.addSource('buildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.current.addLayer({
        id: 'buildings-layer',
        type: 'circle',
        source: 'buildings',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, ['*', 0.5, ['sqrt', ['get', 'count']]],
            14, ['*', 1.5, ['sqrt', ['get', 'count']]],
            18, ['*', 3, ['sqrt', ['get', 'count']]],
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
        },
      });

      map.current.on('mouseenter', 'buildings-layer', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'buildings-layer', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      map.current.on('click', 'buildings-layer', (e) => {
        if (!e.features || !e.features[0] || !map.current) return;

        const props = e.features[0].properties;
        const year = props.year;
        const use = props.use || 'Unknown';
        const count = props.count || 1;

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            <strong>${count} building${count > 1 ? 's' : ''}</strong><br/>
            Earliest: ${year}<br/>
            Primary use: ${use}
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
    if (!map.current || !filteredBuildings) return;

    const source = map.current.getSource('buildings') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(filteredBuildings as GeoJSON.FeatureCollection);
    }
  }, [filteredBuildings]);

  const buildingCount = filteredBuildings?.features.length ?? 0;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      <div style={styles.title}>
        <h1 style={{ margin: 0, fontSize: 18 }}>San Francisco Urban Development</h1>
        <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
          {buildingCount.toLocaleString()} buildings shown
        </p>
      </div>

      <Legend />

      {timeline && (
        <TimelineControls
          timeline={timeline}
          minYear={1848}
          maxYear={2022}
          onYearRangeChange={handleYearRangeChange}
          accumulatePaths={accumulatePaths}
          onAccumulatePathsChange={setAccumulatePaths}
        />
      )}
    </div>
  );
}

function Legend() {
  const useTypes = [
    { label: 'Single Family', color: '#3498db' },
    { label: 'Multi-Family', color: '#9b59b6' },
    { label: 'Retail', color: '#e74c3c' },
    { label: 'Office', color: '#e67e22' },
    { label: 'Hotel', color: '#f39c12' },
    { label: 'Industrial', color: '#7f8c8d' },
    { label: 'Government', color: '#27ae60' },
    { label: 'Mixed Use', color: '#1abc9c' },
  ];

  return (
    <div style={styles.legend}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Land Use</div>
      {useTypes.map(({ label, color }) => (
        <div
          key={label}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
        >
          <div style={{ width: 10, height: 10, background: color, borderRadius: '50%' }} />
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
    fontSize: 11,
  },
};
