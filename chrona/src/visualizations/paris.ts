import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const parisConfig: VisualizationConfig = {
  id: 'paris',
  name: 'Paris Development',

  center: [2.3522, 48.8566], // Central Paris
  zoom: 12,

  timeRange: {
    start: '1700-01-01',
    end: '2025-01-01',
  },
  defaultSpeed: 86400 * 365 * 5, // 5 years/sec

  sources: [
    {
      id: 'buildings',
      type: 'geojson',
      url: '/data/paris/buildings.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'buildings-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/paris/buildings.pmtiles',
      sourceLayer: 'buildings',
      minzoom: ZOOM_THRESHOLD,
    },
  ],

  layers: [
    {
      id: 'buildings-layer',
      sourceId: 'buildings',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, ['max', 2, ['min', 5, ['/', ['sqrt', ['get', 'area']], 500]]],
          14, ['max', 3, ['min', 8, ['/', ['sqrt', ['get', 'area']], 200]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 30,
      },
    },
    {
      id: 'buildings-detailed-layer',
      sourceId: 'buildings-tiles',
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
        fadeYears: 30,
        useGpuFilter: true,
      },
    },
  ],

  legend: {
    title: 'Building Use',
    items: [
      { label: 'Residential', color: '#3498db', shape: 'circle' },
      { label: 'Commercial', color: '#e74c3c', shape: 'circle' },
      { label: 'Industrial', color: '#7f8c8d', shape: 'circle' },
      { label: 'Public', color: '#27ae60', shape: 'circle' },
      { label: 'Mixed', color: '#1abc9c', shape: 'circle' },
    ],
  },

  controls: {
    variant: 'compact',
    speedOptions: [
      { label: '2yr/s', value: 86400 * 365 * 2 },
      { label: '5yr/s', value: 86400 * 365 * 5 },
      { label: '10yr/s', value: 86400 * 365 * 10 },
      { label: '20yr/s', value: 86400 * 365 * 20 },
      { label: '50yr/s', value: 86400 * 365 * 50 },
    ],
    showYearRange: false,
    showAccumulateToggle: true,
    showMonth: false,
  },

  defaultYearRange: [1700, 2024],

  title: {
    text: 'Paris Urban Development',
    sumProperty: 'count',
    countLabel: 'buildings',
  },

  popup: {
    layers: ['buildings-layer', 'buildings-detailed-layer'],
    render: (props) => {
      // Aggregated cluster
      if (props.count && (props.count as number) > 1) {
        const count = props.count as number;
        const year = props.year;
        const estimated = props.estimated;
        const use = props.use || 'Unknown';
        return `
          <strong>${count.toLocaleString()} buildings</strong><br/>
          Earliest: ${year}${estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${use}
        `;
      }
      // Individual building
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use || 'Unknown';
      const height = props.height;
      return `
        Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}<br/>
        Use: ${use}
        ${height ? `<br/>Height: ${height}m` : ''}
      `;
    },
  },
};
