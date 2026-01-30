import type { VisualizationConfig } from './types';

export const nycConfig: VisualizationConfig = {
  id: 'nyc',
  name: 'NYC Development',

  center: [-73.9857, 40.7484], // Midtown Manhattan
  zoom: 11,

  timeRange: {
    start: '1800-01-01',
    end: '2025-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    {
      id: 'lots',
      type: 'geojson',
      url: '/data/nyc/lots.geojson',
    },
  ],

  layers: [
    {
      id: 'lots-layer',
      sourceId: 'lots',
      type: 'circle',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, ['max', 1, ['min', 3, ['/', ['sqrt', ['get', 'area']], 1000]]],
          12, ['max', 2, ['min', 5, ['/', ['sqrt', ['get', 'area']], 500]]],
          15, ['max', 3, ['min', 8, ['/', ['sqrt', ['get', 'area']], 200]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 20,
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

  defaultYearRange: [1800, 2024],

  title: {
    text: 'New York City Urban Development',
    sumProperty: 'count',
    countLabel: 'tax lots',
  },

  popup: {
    layers: ['lots-layer'],
    render: (props) => {
      const count = props.count as number || 1;
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use || 'Unknown';
      return `
        <strong>${count.toLocaleString()} tax lot${count > 1 ? 's' : ''}</strong><br/>
        Earliest: ${year}${estimated ? ' (includes estimates)' : ''}<br/>
        Primary use: ${use}
      `;
    },
  },
};
