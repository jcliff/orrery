import type { VisualizationConfig } from './types';

export const hurricanesConfig: VisualizationConfig = {
  id: 'hurricanes',
  name: 'Atlantic Hurricanes',

  center: [-60, 25],
  zoom: 3,

  timeRange: {
    start: '1985-06-01',
    end: '2001-01-01',
  },
  defaultSpeed: 86400 * 30, // 1 month/sec
  seasonMonths: [5, 10], // Jun-Nov (0-indexed)

  sources: [
    {
      id: 'hurricane-segments',
      type: 'geojson',
      url: '/data/hurricanes/segments.geojson',
    },
    {
      id: 'hurricane-points',
      type: 'geojson',
      url: '/data/hurricanes/points.geojson',
    },
  ],

  layers: [
    {
      id: 'hurricane-tracks-layer',
      sourceId: 'hurricane-segments',
      type: 'line',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'interpolate',
          ['linear'],
          ['get', 'category'],
          0, 0.5,
          1, 1,
          2, 1.5,
          3, 2,
          4, 2.5,
          5, 3,
        ],
        'line-opacity': ['get', 'opacity'],
      },
      temporal: {
        mode: 'cumulative',
        fadeMonths: 3,
      },
    },
    {
      id: 'active-storms-pulse',
      sourceId: 'active-storms',
      type: 'circle',
      paint: {
        'circle-radius': 20,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.3,
        'circle-stroke-width': 0,
      },
    },
    {
      id: 'active-storms-dot',
      sourceId: 'active-storms',
      type: 'circle',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'category'],
          0, 6,
          1, 7,
          2, 8,
          3, 9,
          4, 10,
          5, 12,
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 1,
        'circle-stroke-width': 2,
        'circle-stroke-color': 'white',
      },
    },
  ],

  legend: {
    title: 'Intensity',
    items: [
      { label: 'TD/TS', color: '#6ec4e8', shape: 'line' },
      { label: 'Cat 1', color: '#ffe066', shape: 'line' },
      { label: 'Cat 2', color: '#ffb347', shape: 'line' },
      { label: 'Cat 3', color: '#ff6b6b', shape: 'line' },
      { label: 'Cat 4', color: '#d63031', shape: 'line' },
      { label: 'Cat 5', color: '#6c3483', shape: 'line' },
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

  defaultYearRange: [1985, 2000],

  title: {
    text: 'Atlantic Hurricane Tracks',
    countProperty: 'stormId',
    countLabel: 'storms',
  },

  popup: {
    layers: ['hurricane-tracks-layer'],
    render: (props) => {
      const name = props.stormName || 'Unnamed';
      const year = props.year;
      const category = props.category;
      const wind = props.wind;
      return `
        <strong>${name} (${year})</strong><br/>
        Category: ${category}<br/>
        Wind: ${wind} kt
      `;
    },
  },
};
