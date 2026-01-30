import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const bayAreaConfig: VisualizationConfig = {
  id: 'bay-area',
  name: 'Bay Area Development',

  // Center on Bay Area (between SF and South Bay/North Bay)
  center: [-122.15, 37.75],
  zoom: 9,

  timeRange: {
    start: '1848-01-01',
    end: '2026-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    // SF sources
    {
      id: 'sf-buildings',
      type: 'geojson',
      url: '/data/sf-urban/buildings.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'sf-buildings-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/sf-urban/buildings.pmtiles',
      sourceLayer: 'buildings',
      minzoom: ZOOM_THRESHOLD,
    },
    // Palo Alto sources
    {
      id: 'pa-parcels-aggregated',
      type: 'geojson',
      url: '/data/palo-alto/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'pa-parcels-detailed',
      type: 'geojson',
      url: '/data/palo-alto/parcels-detailed.geojson',
      minzoom: ZOOM_THRESHOLD,
    },
    // Campbell sources
    {
      id: 'campbell-parcels-aggregated',
      type: 'geojson',
      url: '/data/campbell/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'campbell-parcels-detailed',
      type: 'geojson',
      url: '/data/campbell/parcels-detailed.geojson',
      minzoom: ZOOM_THRESHOLD,
    },
    // Solano County sources
    {
      id: 'solano-parcels-aggregated',
      type: 'geojson',
      url: '/data/solano/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'solano-parcels-detailed',
      type: 'geojson',
      url: '/data/solano/parcels-detailed.geojson',
      minzoom: ZOOM_THRESHOLD,
    },
  ],

  layers: [
    // SF layers (zoomed out)
    {
      id: 'sf-buildings-layer',
      sourceId: 'sf-buildings',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, ['max', 2, ['min', 6, ['/', ['sqrt', ['get', 'area']], 150]]],
          14, ['max', 3, ['min', 10, ['/', ['sqrt', ['get', 'area']], 80]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    // SF layers (zoomed in - PMTiles)
    {
      id: 'sf-buildings-detailed-layer',
      sourceId: 'sf-buildings-tiles',
      sourceLayer: 'buildings',
      type: 'circle',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15, ['max', 2, ['min', 4, ['/', ['sqrt', ['get', 'area']], 100]]],
          18, ['max', 4, ['min', 8, ['/', ['sqrt', ['get', 'area']], 50]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.8,
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
        useGpuFilter: true,
      },
    },
    // Palo Alto layers (zoomed out)
    {
      id: 'pa-parcels-circles',
      sourceId: 'pa-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, ['max', 2, ['min', 6, ['/', ['sqrt', ['get', 'area']], 500]]],
          14, ['max', 4, ['min', 10, ['/', ['sqrt', ['get', 'area']], 200]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    // Palo Alto layers (zoomed in - polygons)
    {
      id: 'pa-parcels-fill',
      sourceId: 'pa-parcels-detailed',
      type: 'fill',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.7],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    {
      id: 'pa-parcels-outline',
      sourceId: 'pa-parcels-detailed',
      type: 'line',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1,
        'line-opacity': 0.9,
      },
    },
    // Campbell layers (zoomed out)
    {
      id: 'campbell-parcels-circles',
      sourceId: 'campbell-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, ['max', 2, ['min', 6, ['/', ['sqrt', ['get', 'area']], 500]]],
          14, ['max', 4, ['min', 10, ['/', ['sqrt', ['get', 'area']], 200]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    // Campbell layers (zoomed in - polygons)
    {
      id: 'campbell-parcels-fill',
      sourceId: 'campbell-parcels-detailed',
      type: 'fill',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.7],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    {
      id: 'campbell-parcels-outline',
      sourceId: 'campbell-parcels-detailed',
      type: 'line',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1,
        'line-opacity': 0.9,
      },
    },
    // Solano County layers (zoomed out)
    {
      id: 'solano-parcels-circles',
      sourceId: 'solano-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, ['max', 2, ['min', 6, ['/', ['sqrt', ['get', 'area']], 500]]],
          14, ['max', 4, ['min', 10, ['/', ['sqrt', ['get', 'area']], 200]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    // Solano County layers (zoomed in - polygons)
    {
      id: 'solano-parcels-fill',
      sourceId: 'solano-parcels-detailed',
      type: 'fill',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.7],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    {
      id: 'solano-parcels-outline',
      sourceId: 'solano-parcels-detailed',
      type: 'line',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1,
        'line-opacity': 0.9,
      },
    },
  ],

  legend: {
    title: 'Land Use',
    items: [
      { label: 'Single Family', color: '#3498db', shape: 'circle' },
      { label: 'Multi-Family', color: '#9b59b6', shape: 'circle' },
      { label: 'Commercial/Retail', color: '#e74c3c', shape: 'circle' },
      { label: 'Office', color: '#e67e22', shape: 'circle' },
      { label: 'Industrial', color: '#7f8c8d', shape: 'circle' },
      { label: 'Public/Gov', color: '#27ae60', shape: 'circle' },
      { label: 'Mixed Use', color: '#1abc9c', shape: 'circle' },
    ],
  },

  controls: {
    variant: 'compact',
    speedOptions: [
      { label: '1yr/s', value: 86400 * 365 },
      { label: '2yr/s', value: 86400 * 365 * 2 },
      { label: '5yr/s', value: 86400 * 365 * 5 },
      { label: '10yr/s', value: 86400 * 365 * 10 },
      { label: '20yr/s', value: 86400 * 365 * 20 },
    ],
    showYearRange: false,
    showAccumulateToggle: true,
    showMonth: false,
  },

  defaultYearRange: [1848, 2025],

  title: {
    text: 'Bay Area Urban Development',
    sumProperty: 'count',
    countLabel: 'buildings',
  },

  popup: {
    layers: ['sf-buildings-layer', 'sf-buildings-detailed-layer', 'pa-parcels-circles', 'pa-parcels-fill', 'campbell-parcels-circles', 'campbell-parcels-fill', 'solano-parcels-circles', 'solano-parcels-fill'],
    render: (props) => {
      // Aggregated cluster
      if (props.count && (props.count as number) > 1) {
        return `
          <strong>${props.count} ${props.apn ? 'parcels' : 'buildings'}</strong><br/>
          Earliest: ${props.year}${props.estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${props.use || 'Unknown'}
        `;
      }
      // Individual building/parcel
      const address = props.address || '';
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use;
      const neighborhood = props.neighborhood || '';
      const apn = props.apn;
      return `
        ${address ? `<strong>${address}</strong><br/>` : ''}
        Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}
        ${use ? `<br/>Use: ${use}` : ''}
        ${neighborhood ? `<br/>${neighborhood}` : ''}
        ${apn ? `<br/><small>APN: ${apn}</small>` : ''}
      `;
    },
  },
};
