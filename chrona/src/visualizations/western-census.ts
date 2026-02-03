import type { VisualizationConfig } from './types';

export const westernCensusConfig: VisualizationConfig = {
  id: 'western-census',
  name: 'Western Census History',

  // Center to show 11 Western states
  center: [-112, 40],
  zoom: 4,

  timeRange: {
    start: '1870-01-01',
    end: '2021-01-01',
  },
  defaultSpeed: 86400 * 365 * 10, // 10 years/sec

  sources: [
    {
      id: 'western-counties',
      type: 'geojson',
      url: '/data/nhgis-western/counties.geojson',
    },
  ],

  layers: [
    // County fill layer
    {
      id: 'western-counties-fill',
      sourceId: 'western-counties',
      type: 'fill',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.7,
      },
      temporal: {
        mode: 'active',
        useGpuFilter: false,
      },
    },
    // County outline layer
    {
      id: 'western-counties-outline',
      sourceId: 'western-counties',
      type: 'line',
      paint: {
        'line-color': '#333',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          4, 0.5,
          7, 1,
          10, 2,
        ],
        'line-opacity': 0.8,
      },
      temporal: {
        mode: 'active',
        useGpuFilter: false,
      },
    },
  ],

  legend: {
    title: 'Population Density',
    items: [
      { label: '<1/sq mi', color: '#f7fbff', shape: 'square' },
      { label: '1-10/sq mi', color: '#c6dbef', shape: 'square' },
      { label: '10-50/sq mi', color: '#6baed6', shape: 'square' },
      { label: '50-100/sq mi', color: '#4292c6', shape: 'square' },
      { label: '100-500/sq mi', color: '#2171b5', shape: 'square' },
      { label: '>500/sq mi', color: '#08306b', shape: 'square' },
    ],
  },

  controls: {
    variant: 'compact',
    speedOptions: [
      { label: '5yr/s', value: 86400 * 365 * 5 },
      { label: '10yr/s', value: 86400 * 365 * 10 },
      { label: '20yr/s', value: 86400 * 365 * 20 },
      { label: '50yr/s', value: 86400 * 365 * 50 },
    ],
    showYearRange: false,
    showAccumulateToggle: false,
    showMonth: false,
  },

  defaultYearRange: [1870, 2020],

  title: {
    text: 'Western US Census History (1870-2020)',
    countProperty: 'gisjoin',
    countLabel: 'counties',
  },

  popup: {
    layers: ['western-counties-fill'],
    render: (props) => {
      const name = props.name as string;
      const year = props.year as number;
      const totalPop = props.totalPop as number;
      const area = props.area as number;
      const popDensity = props.popDensity as number;

      return `
        <strong>${name} County</strong><br/>
        Census: ${year}<br/>
        Population: ${totalPop.toLocaleString()}<br/>
        ${area > 0 ? `Area: ${area.toLocaleString()} sq mi<br/>` : ''}
        ${popDensity > 0 ? `Density: ${popDensity.toFixed(1)}/sq mi` : ''}
      `;
    },
  },
};
