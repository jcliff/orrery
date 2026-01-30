import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const laCountyConfig: VisualizationConfig = {
  id: 'la-county',
  name: 'LA County Development',

  center: [-118.2437, 34.0522], // Downtown LA
  zoom: 10,

  timeRange: {
    start: '1850-01-01',
    end: '2025-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    {
      id: 'parcels',
      type: 'geojson',
      url: '/data/la-county/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/la-county/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
  ],

  layers: [
    {
      id: 'parcels-layer',
      sourceId: 'parcels',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8, ['max', 1, ['min', 3, ['/', ['sqrt', ['get', 'area']], 800]]],
          10, ['max', 2, ['min', 5, ['/', ['sqrt', ['get', 'area']], 500]]],
          14, ['max', 3, ['min', 6, ['/', ['sqrt', ['get', 'area']], 300]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
      },
    },
    {
      id: 'parcels-detailed-layer',
      sourceId: 'parcels-tiles',
      sourceLayer: 'parcels',
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
  ],

  legend: {
    title: 'Land Use',
    items: [
      { label: 'Single Family', color: '#3498db', shape: 'circle' },
      { label: 'Multi-Family', color: '#9b59b6', shape: 'circle' },
      { label: 'Commercial', color: '#e74c3c', shape: 'circle' },
      { label: 'Industrial', color: '#7f8c8d', shape: 'circle' },
      { label: 'Open Space', color: '#27ae60', shape: 'circle' },
      { label: 'Public', color: '#2ecc71', shape: 'circle' },
      { label: 'Mixed', color: '#1abc9c', shape: 'circle' },
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

  defaultYearRange: [1850, 2020],

  title: {
    text: 'Los Angeles County Urban Development',
    sumProperty: 'count',
    countLabel: 'parcels',
  },

  popup: {
    layers: ['parcels-layer', 'parcels-detailed-layer'],
    render: (props) => {
      // Different rendering for aggregated vs detailed
      if (props.count && (props.count as number) > 1) {
        const count = props.count as number;
        const year = props.year;
        const estimated = props.estimated;
        const use = props.use || 'Unknown';
        return `
          <strong>${count.toLocaleString()} parcel${count > 1 ? 's' : ''}</strong><br/>
          Earliest: ${year}${estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${use}
        `;
      }
      // Individual parcel from PMTiles
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use || 'Unknown';
      const address = props.address || '';
      const apn = props.apn || '';
      return `
        ${address ? `<strong>${address}</strong><br/>` : ''}
        Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}
        ${use ? `<br/>Use: ${use}` : ''}
        ${apn ? `<br/>APN: ${apn}` : ''}
      `;
    },
  },
};
