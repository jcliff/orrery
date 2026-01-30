import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 14;

export const clarkCountyConfig: VisualizationConfig = {
  id: 'clark-county',
  name: 'Las Vegas Development',

  // Center on Las Vegas
  center: [-115.17, 36.12],
  zoom: 10,

  timeRange: {
    start: '1950-01-01',
    end: '2026-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    // Aggregated clusters for zoomed-out view
    {
      id: 'clark-parcels-aggregated',
      type: 'geojson',
      url: '/data/clark-county/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    // Detailed polygons for zoomed-in view
    {
      id: 'clark-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/clark-county/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
  ],

  layers: [
    // Clusters at low zoom
    {
      id: 'clark-parcels-circles',
      sourceId: 'clark-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8, ['+', 2, ['*', 0.3, ['sqrt', ['get', 'n']]]],
          12, ['+', 3, ['*', 0.5, ['sqrt', ['get', 'n']]]],
          14, ['+', 5, ['*', 0.8, ['sqrt', ['get', 'n']]]],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': [
          'case',
          ['==', ['get', 'e'], 1],
          0.5,
          0.8,
        ],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 10,
      },
    },
    // Detailed polygon fills at high zoom
    {
      id: 'clark-parcels-fill',
      sourceId: 'clark-parcels-tiles',
      sourceLayer: 'parcels',
      type: 'fill',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': [
          'case',
          ['==', ['get', 'e'], 1],
          0.5,
          0.7,
        ],
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 10,
        useGpuFilter: true,
        yearProperty: 'y',
      },
    },
    // Outline for polygon detail
    {
      id: 'clark-parcels-outline',
      sourceId: 'clark-parcels-tiles',
      sourceLayer: 'parcels',
      type: 'line',
      minzoom: ZOOM_THRESHOLD,
      paint: {
        'line-color': '#333',
        'line-width': 0.5,
        'line-opacity': 0.3,
      },
      temporal: {
        mode: 'cumulative',
        fadeYears: 10,
        useGpuFilter: true,
        yearProperty: 'y',
      },
    },
  ],

  legend: {
    title: 'Land Use',
    items: [
      { label: 'Residential', color: '#3498db', shape: 'circle' },
      { label: 'Commercial', color: '#e74c3c', shape: 'circle' },
      { label: 'Industrial', color: '#7f8c8d', shape: 'circle' },
      { label: 'Vacant', color: '#f39c12', shape: 'circle' },
      { label: 'Government', color: '#27ae60', shape: 'circle' },
    ],
  },

  controls: {
    variant: 'compact',
    speedOptions: [
      { label: '1yr/s', value: 86400 * 365 },
      { label: '2yr/s', value: 86400 * 365 * 2 },
      { label: '5yr/s', value: 86400 * 365 * 5 },
      { label: '10yr/s', value: 86400 * 365 * 10 },
    ],
    showYearRange: false,
    showAccumulateToggle: true,
    showMonth: false,
  },

  defaultYearRange: [1950, 2025],

  title: {
    text: 'Las Vegas Urban Development',
    sumProperty: 'n',
    countLabel: 'parcels',
  },

  popup: {
    layers: ['clark-parcels-circles', 'clark-parcels-fill'],
    render: (props) => {
      const count = props.n as number;
      const year = props.y;
      const estimated = props.e === 1;
      const use = props.u;
      const acres = props.a as number;

      // Aggregated cluster
      if (count && count > 1) {
        return `
          <strong>${count.toLocaleString()} parcels</strong><br/>
          Earliest: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}<br/>
          Primary use: ${use || 'Unknown'}<br/>
          ${acres ? `Total: ${acres.toLocaleString()} acres` : ''}
        `;
      }

      // Individual parcel
      return `
        <strong>${use || 'Parcel'}</strong><br/>
        ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}
      `;
    },
  },
};
