import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const paloAltoConfig: VisualizationConfig = {
  id: 'palo-alto',
  name: 'Palo Alto Development',

  center: [-122.1430, 37.4419],
  zoom: 13,

  timeRange: {
    start: '1880-01-01',
    end: '2026-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    {
      id: 'parcels-aggregated',
      type: 'geojson',
      url: '/data/palo-alto/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'parcels-detailed',
      type: 'geojson',
      url: '/data/palo-alto/parcels-detailed.geojson',
      minzoom: ZOOM_THRESHOLD,
    },
  ],

  layers: [
    {
      id: 'parcels-circles',
      sourceId: 'parcels-aggregated',
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
    {
      id: 'parcels-fill',
      sourceId: 'parcels-detailed',
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
      id: 'parcels-outline',
      sourceId: 'parcels-detailed',
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
      { label: 'Single Family', color: '#3498db', shape: 'square' },
      { label: 'Multi-Family', color: '#9b59b6', shape: 'square' },
      { label: 'Commercial', color: '#e74c3c', shape: 'square' },
      { label: 'Downtown', color: '#f39c12', shape: 'square' },
      { label: 'Research/Office', color: '#7f8c8d', shape: 'square' },
      { label: 'Open Space', color: '#27ae60', shape: 'square' },
      { label: 'Public Facilities', color: '#2ecc71', shape: 'square' },
      { label: 'Mixed/Industrial', color: '#1abc9c', shape: 'square' },
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

  defaultYearRange: [1880, 2025],

  title: {
    text: 'Palo Alto Urban Development',
    sumProperty: 'count',
    countLabel: 'parcels',
  },

  popup: {
    layers: ['parcels-circles', 'parcels-fill'],
    render: (props) => {
      // Different rendering for aggregated vs detailed
      if (props.count && (props.count as number) > 1) {
        return `
          <strong>${props.count || 1} parcel${((props.count as number) || 1) > 1 ? 's' : ''}</strong><br/>
          Earliest: ${props.year}${props.estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${props.use || 'Unknown'}
        `;
      }
      const address = props.address || '';
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use;
      const apn = props.apn;
      return `
        ${address ? `<strong>${address}</strong><br/>` : ''}
        Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}
        ${use ? `<br/>Use: ${use}` : ''}
        ${apn ? `<br/><small>APN: ${apn}</small>` : ''}
      `;
    },
  },
};
