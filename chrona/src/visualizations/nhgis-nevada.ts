import type { VisualizationConfig } from './types';

export const nhgisNevadaConfig: VisualizationConfig = {
  id: 'nhgis-nevada',
  name: 'Nevada Census History',

  // Center on Nevada
  center: [-117, 39],
  zoom: 6,

  timeRange: {
    start: '1870-01-01',
    end: '2021-01-01',
  },
  defaultSpeed: 86400 * 365 * 10, // 10 years/sec

  sources: [
    {
      id: 'nhgis-nevada-counties',
      type: 'geojson',
      url: '/data/nhgis-nevada/counties.geojson',
    },
    {
      id: 'nhgis-nevada-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/nhgis-nevada/counties.pmtiles',
      sourceLayer: 'counties',
    },
  ],

  layers: [
    // County fill layer (show counties as polygons)
    {
      id: 'nhgis-nevada-fill',
      sourceId: 'nhgis-nevada-counties',
      type: 'fill',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.7,
      },
      temporal: {
        mode: 'cumulative',
        useGpuFilter: false,
      },
    },
    // County outline layer
    {
      id: 'nhgis-nevada-outline',
      sourceId: 'nhgis-nevada-counties',
      type: 'line',
      paint: {
        'line-color': '#333',
        'line-width': 1,
        'line-opacity': 0.8,
      },
      temporal: {
        mode: 'cumulative',
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
      { label: '100-250/sq mi', color: '#2171b5', shape: 'square' },
      { label: '>250/sq mi', color: '#08306b', shape: 'square' },
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
    text: 'Nevada Census History (1870-2020)',
    countProperty: 'gisjoin',
    countLabel: 'counties',
  },

  popup: {
    layers: ['nhgis-nevada-fill'],
    render: (props) => {
      const name = props.name as string;
      const year = props.year as number;
      const totalPop = props.totalPop as number;
      const housingUnits = props.housingUnits as number | undefined;
      const area = props.area as number;
      const popDensity = props.popDensity as number;

      return `
        <strong>${name} County</strong><br/>
        Census: ${year}<br/>
        Population: ${totalPop.toLocaleString()}<br/>
        ${housingUnits !== undefined ? `Housing Units: ${housingUnits.toLocaleString()}<br/>` : ''}
        Area: ${area.toLocaleString()} sq mi<br/>
        Density: ${popDensity.toFixed(1)}/sq mi
      `;
    },
  },
};
