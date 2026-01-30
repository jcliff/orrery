import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Timeline,
  filterByTime,
  type TemporalFeatureCollection,
} from 'chrona';
import { TimelineControls } from './components/TimelineControls';

const PARCELS_URL = '/parcels.geojson';
const PARCELS_DETAILED_URL = '/parcels-detailed.geojson';
const ZOOM_THRESHOLD = 14; // Switch to detailed polygon view at this zoom level

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [parcelsData, setParcelsData] = useState<TemporalFeatureCollection | null>(null);
  const [detailedData, setDetailedData] = useState<TemporalFeatureCollection | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1880, 2025]);
  const [accumulatePaths, setAccumulatePaths] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Create timeline once we have data
  const timeline = useMemo(() => {
    if (!parcelsData) return null;
    return new Timeline({
      start: new Date('1880-01-01'),
      end: new Date('2026-01-01'),
      speed: 86400 * 365 * 2, // 2 years/sec
    });
  }, [parcelsData]);

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

  // Load parcels data on mount
  useEffect(() => {
    // Load aggregated data (for zoomed out view)
    fetch(PARCELS_URL)
      .then((res) => res.json())
      .then((data) => setParcelsData(data as TemporalFeatureCollection));

    // Load detailed data (for zoomed in polygon view)
    fetch(PARCELS_DETAILED_URL)
      .then((res) => res.json())
      .then((data) => setDetailedData(data as TemporalFeatureCollection));
  }, []);

  // Filter aggregated parcels based on current time AND year range
  const filteredParcels = useMemo(() => {
    if (!parcelsData || !currentTime) return null;

    const currentMs = currentTime.getTime();
    const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
    const TWENTY_YEARS_MS = 20 * 365 * 24 * 60 * 60 * 1000;

    const timeFiltered = filterByTime(parcelsData, currentTime, { mode: 'cumulative' });

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
        let opacity = 0.7;

        if (!accumulatePaths) {
          const startTime = new Date(f.properties.startTime as string).getTime();
          const age = currentMs - startTime;

          if (age <= TEN_YEARS_MS) {
            opacity = 0.8;
          } else {
            const fadeProgress = (age - TEN_YEARS_MS) / (TWENTY_YEARS_MS - TEN_YEARS_MS);
            opacity = 0.8 * (1 - fadeProgress);
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
  }, [parcelsData, currentTime, yearRange, accumulatePaths]);

  // Filter detailed parcels based on current time AND year range
  const filteredDetailedParcels = useMemo(() => {
    if (!detailedData || !currentTime) return null;

    const currentMs = currentTime.getTime();
    const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
    const TWENTY_YEARS_MS = 20 * 365 * 24 * 60 * 60 * 1000;

    const timeFiltered = filterByTime(detailedData, currentTime, { mode: 'cumulative' });

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
        let opacity = 0.7;

        if (!accumulatePaths) {
          const startTime = new Date(f.properties.startTime as string).getTime();
          const age = currentMs - startTime;

          if (age <= TEN_YEARS_MS) {
            opacity = 0.8;
          } else {
            const fadeProgress = (age - TEN_YEARS_MS) / (TWENTY_YEARS_MS - TEN_YEARS_MS);
            opacity = 0.8 * (1 - fadeProgress);
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
  }, [detailedData, currentTime, yearRange, accumulatePaths]);

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
      center: [-122.1430, 37.4419], // Palo Alto
      zoom: 13,
    });

    map.current.on('load', () => {
      if (!map.current) return;

      // Aggregated source (GeoJSON points - for zoomed out view)
      map.current.addSource('parcels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Detailed source (GeoJSON polygons - for zoomed in view)
      map.current.addSource('parcels-detailed', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Aggregated layer (circles when zoomed out)
      map.current.addLayer({
        id: 'parcels-layer',
        type: 'circle',
        source: 'parcels',
        maxzoom: ZOOM_THRESHOLD,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, ['max', 2, ['min', 8, ['/', ['sqrt', ['get', 'area']], 500]]],
            13, ['max', 4, ['min', 12, ['/', ['sqrt', ['get', 'area']], 200]]],
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
        },
      });

      // Detailed layer - POLYGON FILL (shown when zoomed in)
      map.current.addLayer({
        id: 'parcels-detailed-fill',
        type: 'fill',
        source: 'parcels-detailed',
        minzoom: ZOOM_THRESHOLD,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['coalesce', ['get', 'opacity'], 0.7],
        },
      });

      // Detailed layer - POLYGON OUTLINE
      map.current.addLayer({
        id: 'parcels-detailed-outline',
        type: 'line',
        source: 'parcels-detailed',
        minzoom: ZOOM_THRESHOLD,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1,
          'line-opacity': 0.9,
        },
      });

      setMapLoaded(true);

      // Mouse events for all interactive layers
      for (const layerId of ['parcels-layer', 'parcels-detailed-fill']) {
        map.current.on('mouseenter', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });

        map.current.on('mouseleave', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      // Click handler for aggregated layer
      map.current.on('click', 'parcels-layer', (e) => {
        if (!e.features || !e.features[0] || !map.current) return;

        const props = e.features[0].properties;
        const year = props.year;
        const estimated = props.estimated;
        const use = props.use || 'Unknown';
        const count = props.count || 1;

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            <strong>${count} parcel${count > 1 ? 's' : ''}</strong><br/>
            Earliest: ${year}${estimated ? ' (includes estimates)' : ''}<br/>
            Primary use: ${use}
          `
          )
          .addTo(map.current);
      });

      // Click handler for detailed fill layer
      map.current.on('click', 'parcels-detailed-fill', (e) => {
        if (!e.features || !e.features[0] || !map.current) return;

        const props = e.features[0].properties;
        const year = props.year;
        const estimated = props.estimated;
        const use = props.use || 'Unknown';
        const address = props.address || '';
        const apn = props.apn || '';

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            ${address ? `<strong>${address}</strong><br/>` : ''}
            Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}
            ${use ? `<br/>Use: ${use}` : ''}
            ${apn ? `<br/><small>APN: ${apn}</small>` : ''}
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

  // Update aggregated layer data (GeoJSON)
  useEffect(() => {
    if (!map.current || !mapLoaded || !filteredParcels) return;

    const source = map.current.getSource('parcels') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(filteredParcels as GeoJSON.FeatureCollection);
    }
  }, [filteredParcels, mapLoaded]);

  // Update detailed layer data (GeoJSON polygons)
  useEffect(() => {
    if (!map.current || !mapLoaded || !filteredDetailedParcels) return;

    const source = map.current.getSource('parcels-detailed') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(filteredDetailedParcels as GeoJSON.FeatureCollection);
    }
  }, [filteredDetailedParcels, mapLoaded]);

  const parcelCount = filteredParcels?.features.reduce(
    (sum, f) => sum + (((f.properties as Record<string, unknown>).count as number) || 1),
    0
  ) ?? 0;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      <div style={styles.title}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Palo Alto Urban Development</h1>
        <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
          {parcelCount.toLocaleString()} parcels shown
        </p>
      </div>

      <Legend />

      {timeline && (
        <TimelineControls
          timeline={timeline}
          minYear={1880}
          maxYear={2025}
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
    { label: 'Commercial', color: '#e74c3c' },
    { label: 'Downtown', color: '#f39c12' },
    { label: 'Research/Office', color: '#7f8c8d' },
    { label: 'Open Space', color: '#27ae60' },
    { label: 'Public Facilities', color: '#2ecc71' },
    { label: 'Mixed/Industrial', color: '#1abc9c' },
  ];

  return (
    <div style={styles.legend}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Land Use</div>
      {useTypes.map(({ label, color }) => (
        <div
          key={label}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
        >
          <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
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
