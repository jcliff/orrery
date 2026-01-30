import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const viennaConfig: VisualizationConfig = {
  id: 'vienna',
  name: 'Vienna Development',

  center: [16.37, 48.21], // Central Vienna
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
      url: '/data/vienna/buildings.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'buildings-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/vienna/buildings.pmtiles',
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
          10, ['max', 2, ['min', 5, ['/', ['sqrt', ['get', 'floors']], 10]]],
          14, ['max', 3, ['min', 8, ['/', ['sqrt', ['get', 'floors']], 5]]],
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
          15, ['max', 2, ['min', 4, ['/', ['sqrt', ['get', 'floors']], 2]]],
          18, ['max', 4, ['min', 8, ['/', ['sqrt', ['get', 'floors']], 1]]],
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
      { label: 'Office', color: '#e67e22', shape: 'circle' },
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
    text: 'Vienna Urban Development',
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
        const floors = props.floors as number;
        return `
          <strong>${count.toLocaleString()} buildings</strong><br/>
          ${floors > count ? `Total floors: ${floors.toLocaleString()}<br/>` : ''}
          Earliest: ${estimated ? '~' : ''}${year}${estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${use}
        `;
      }
      // Individual building
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use || 'Unknown';
      const floors = props.floors as number;
      return `
        Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}<br/>
        Use: ${use}
        ${floors > 1 ? `<br/>Floors: ${floors}` : ''}
      `;
    },
  },
};
