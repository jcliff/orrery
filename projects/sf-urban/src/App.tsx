import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import {
  Timeline,
  filterByTime,
  createTemporalFilterWithRange,
  createOpacityExpression,
  type TemporalFeatureCollection,
} from 'chrona';
import { TimelineControls } from './components/TimelineControls';

const BUILDINGS_URL = '/buildings.geojson';
const BUILDINGS_PMTILES_URL = 'pmtiles:///buildings.pmtiles';
const ZOOM_THRESHOLD = 15; // Switch to detailed view at this zoom level

// Register PMTiles protocol once at module level
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [buildingsData, setBuildingsData] = useState<TemporalFeatureCollection | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1848, 1950]);
  const [accumulatePaths, setAccumulatePaths] = useState(true);
  const [tilesLoaded, setTilesLoaded] = useState(false);

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

  // Load aggregated buildings data on mount
  useEffect(() => {
    fetch(BUILDINGS_URL)
      .then((res) => res.json())
      .then((data) => setBuildingsData(data as TemporalFeatureCollection));
  }, []);

  // Filter aggregated buildings based on current time AND year range
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

      // Aggregated source (GeoJSON - for zoomed out view)
      map.current.addSource('buildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Detailed source (PMTiles - for zoomed in view)
      map.current.addSource('buildings-tiles', {
        type: 'vector',
        url: BUILDINGS_PMTILES_URL,
      });

      // Aggregated layer (shown when zoomed out)
      map.current.addLayer({
        id: 'buildings-layer',
        type: 'circle',
        source: 'buildings',
        maxzoom: ZOOM_THRESHOLD,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, ['*', 0.5, ['sqrt', ['get', 'count']]],
            14, ['*', 1.5, ['sqrt', ['get', 'count']]],
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
        },
      });

      // Detailed layer (PMTiles - shown when zoomed in)
      // Uses GPU-evaluated filters instead of setData() for 60fps performance
      map.current.addLayer({
        id: 'buildings-detailed-layer',
        type: 'circle',
        source: 'buildings-tiles',
        'source-layer': 'buildings',
        minzoom: ZOOM_THRESHOLD,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15, 2,
            18, 5,
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.8,
        },
      });

      setTilesLoaded(true);

      // Mouse events for both layers
      for (const layerId of ['buildings-layer', 'buildings-detailed-layer']) {
        map.current.on('mouseenter', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });

        map.current.on('mouseleave', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      // Click handler for aggregated layer
      map.current.on('click', 'buildings-layer', (e) => {
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
            <strong>${count} building${count > 1 ? 's' : ''}</strong><br/>
            Earliest: ${year}${estimated ? ' (includes estimates)' : ''}<br/>
            Primary use: ${use}
          `
          )
          .addTo(map.current);
      });

      // Click handler for detailed layer
      map.current.on('click', 'buildings-detailed-layer', (e) => {
        if (!e.features || !e.features[0] || !map.current) return;

        const props = e.features[0].properties;
        const year = props.year;
        const estimated = props.estimated;
        const use = props.use || 'Unknown';
        const address = props.address || '';
        const neighborhood = props.neighborhood || '';

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            ${address ? `<strong>${address}</strong><br/>` : ''}
            Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}${use ? `<br/>Use: ${use}` : ''}${neighborhood ? `<br/>${neighborhood}` : ''}
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

  // Update aggregated layer data (GeoJSON - still uses setData for small dataset)
  useEffect(() => {
    if (!map.current || !filteredBuildings) return;

    const source = map.current.getSource('buildings') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(filteredBuildings as GeoJSON.FeatureCollection);
    }
  }, [filteredBuildings]);

  // Update detailed layer filter (GPU-evaluated - no setData, no JS loop!)
  // This is the key optimization: setFilter() updates a GPU uniform in O(1)
  // instead of rebuilding spatial index for 212k features
  useEffect(() => {
    if (!map.current || !tilesLoaded || !currentTime) return;

    const year = currentTime.getFullYear();

    // GPU-evaluated temporal filter
    const filter = createTemporalFilterWithRange(year, yearRange, {
      mode: accumulatePaths ? 'cumulative' : 'active',
      fadeYears: 20,
    });

    map.current.setFilter('buildings-detailed-layer', filter);

    // Update opacity expression for active mode (age-based fading)
    if (!accumulatePaths) {
      map.current.setPaintProperty(
        'buildings-detailed-layer',
        'circle-opacity',
        createOpacityExpression(year, 20)
      );
    } else {
      map.current.setPaintProperty('buildings-detailed-layer', 'circle-opacity', 0.8);
    }
  }, [currentTime, yearRange, accumulatePaths, tilesLoaded]);

  const buildingCount = filteredBuildings?.features.reduce(
    (sum, f) => sum + (((f.properties as Record<string, unknown>).count as number) || 1),
    0
  ) ?? 0;

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
