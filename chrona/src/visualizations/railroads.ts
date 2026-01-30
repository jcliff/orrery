import type { VisualizationConfig } from './types';

export const railroadsConfig: VisualizationConfig = {
  id: 'railroads',
  name: 'US Railroads',

  center: [-98, 39],
  zoom: 4,

  timeRange: {
    start: '1830-01-01',
    end: '1916-01-01',
  },
  defaultSpeed: 86400 * 365, // 1 year/sec

  sources: [
    {
      id: 'railroad-tracks',
      type: 'pmtiles',
      url: 'pmtiles:///data/railroads/segments.pmtiles',
      sourceLayer: 'segments',
    },
  ],

  layers: [
    {
      id: 'railroad-tracks-layer',
      sourceId: 'railroad-tracks',
      sourceLayer: 'segments',
      type: 'line',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1.5,
        'line-opacity': 0.8,
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 5,
        useGpuFilter: true,
      },
    },
  ],

  legend: {
    title: 'Region',
    items: [
      { label: 'Northeast', color: '#3498db', shape: 'line' },
      { label: 'Southeast', color: '#e74c3c', shape: 'line' },
      { label: 'Midwest', color: '#27ae60', shape: 'line' },
      { label: 'Great Plains', color: '#f39c12', shape: 'line' },
      { label: 'Mountain West', color: '#9b59b6', shape: 'line' },
      { label: 'Pacific', color: '#1abc9c', shape: 'line' },
    ],
  },

  controls: {
    variant: 'full',
    speedOptions: [
      { label: '1 week/sec', value: 86400 * 7 },
      { label: '2 weeks/sec', value: 86400 * 14 },
      { label: '1 month/sec', value: 86400 * 30 },
      { label: '2 months/sec', value: 86400 * 60 },
      { label: '1 season/sec', value: 86400 * 120 },
      { label: '1 year/sec', value: 86400 * 365 },
      { label: '5 years/sec', value: 86400 * 365 * 5 },
    ],
    showYearRange: true,
    showAccumulateToggle: true,
    showMonth: true,
  },

  defaultYearRange: [1830, 1916],

  title: {
    text: 'US Railroad Development',
    countLabel: 'track segments',
  },

  popup: {
    layers: ['railroad-tracks-layer'],
    render: (props) => {
      const name = props.name || 'Unknown Railroad';
      const year = props.year;
      const state = props.state;
      const miles = typeof props.miles === 'number' ? props.miles.toFixed(1) : null;
      return `
        <strong>${name}</strong><br/>
        Opened: ${year}<br/>
        State: ${state}<br/>
        ${miles ? `Length: ${miles} mi` : ''}
      `;
    },
  },
};
