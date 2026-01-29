import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Timeline, filterByTime, type TemporalFeatureCollection } from 'chrona';
import { TimelineControls } from './components/TimelineControls';

const TRACKS_URL = '/tracks.geojson';

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [tracksData, setTracksData] = useState<TemporalFeatureCollection | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Create timeline once we have data
  const timeline = useMemo(() => {
    if (!tracksData) return null;
    // Data spans 1851-2023
    return new Timeline({
      start: new Date('1851-01-01'),
      end: new Date('2024-01-01'),
      speed: 86400 * 365, // 1 year/sec
    });
  }, [tracksData]);

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

  // Load tracks data
  useEffect(() => {
    fetch(TRACKS_URL)
      .then((res) => res.json())
      .then((data) => setTracksData(data as TemporalFeatureCollection));
  }, []);

  // Filter tracks based on current time
  const filteredTracks = useMemo(() => {
    if (!tracksData || !currentTime) return null;
    return filterByTime(tracksData, currentTime, { mode: 'cumulative' });
  }, [tracksData, currentTime]);

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
        const name = props.name || 'Unnamed';
        const year = props.year;
        const category = props.category;
        const maxWind = props.maxWind;

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            <strong>${name} (${year})</strong><br/>
            Category: ${category}<br/>
            Max Wind: ${maxWind} kt
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

  // Update map data when filtered tracks change
  useEffect(() => {
    if (!map.current || !filteredTracks) return;

    const source = map.current.getSource('hurricane-tracks') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(filteredTracks as GeoJSON.FeatureCollection);
    }
  }, [filteredTracks]);

  const stormCount = filteredTracks?.features.length ?? 0;

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
      {timeline && <TimelineControls timeline={timeline} />}
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
