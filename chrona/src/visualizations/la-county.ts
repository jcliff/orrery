import type { VisualizationConfig } from './types';

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
    },
  ],

  layers: [
    {
      id: 'parcels-layer',
      sourceId: 'parcels',
      type: 'circle',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8, ['max', 1, ['min', 3, ['/', ['sqrt', ['get', 'area']], 800]]],
          10, ['max', 2, ['min', 5, ['/', ['sqrt', ['get', 'area']], 500]]],
          13, ['max', 3, ['min', 8, ['/', ['sqrt', ['get', 'area']], 200]]],
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

  defaultYearRange: [1850, 2020],

  title: {
    text: 'Los Angeles County Urban Development',
    sumProperty: 'count',
    countLabel: 'parcels',
  },

  popup: {
    layers: ['parcels-layer'],
    render: (props) => {
      const count = props.count as number || 1;
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use || 'Unknown';
      return `
        <strong>${count.toLocaleString()} parcel${count > 1 ? 's' : ''}</strong><br/>
        Earliest: ${year}${estimated ? ' (includes estimates)' : ''}<br/>
        Primary use: ${use}
      `;
    },
  },
};
