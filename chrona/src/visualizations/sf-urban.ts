import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const sfUrbanConfig: VisualizationConfig = {
  id: 'sf-urban',
  name: 'SF Urban Development',

  center: [-122.4194, 37.7749],
  zoom: 12,

  timeRange: {
    start: '1848-01-01',
    end: '2023-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    {
      id: 'buildings',
      type: 'geojson',
      url: '/data/sf-urban/buildings.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'buildings-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/sf-urban/buildings.pmtiles',
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
          10, ['max', 2, ['min', 6, ['/', ['sqrt', ['get', 'area']], 150]]],
          14, ['max', 3, ['min', 10, ['/', ['sqrt', ['get', 'area']], 80]]],
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
      { label: 'Retail', color: '#e74c3c', shape: 'circle' },
      { label: 'Office', color: '#e67e22', shape: 'circle' },
      { label: 'Hotel', color: '#f39c12', shape: 'circle' },
      { label: 'Industrial', color: '#7f8c8d', shape: 'circle' },
      { label: 'Government', color: '#27ae60', shape: 'circle' },
      { label: 'Mixed Use', color: '#1abc9c', shape: 'circle' },
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

  defaultYearRange: [1848, 2022],

  title: {
    text: 'San Francisco Urban Development',
    sumProperty: 'count',
    countLabel: 'buildings',
  },

  popup: {
    layers: ['buildings-layer', 'buildings-detailed-layer'],
    render: (props) => {
      // Different rendering for aggregated vs detailed
      if (props.count && (props.count as number) > 1) {
        const count = props.count;
        const year = props.year;
        const estimated = props.estimated;
        const use = props.use || 'Unknown';
        return `
          <strong>${count} building${(count as number) > 1 ? 's' : ''}</strong><br/>
          Earliest: ${year}${estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${use}
        `;
      }
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use || 'Unknown';
      const address = props.address || '';
      const neighborhood = props.neighborhood || '';
      return `
        ${address ? `<strong>${address}</strong><br/>` : ''}
        Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}${use ? `<br/>Use: ${use}` : ''}${neighborhood ? `<br/>${neighborhood}` : ''}
      `;
    },
  },
};
