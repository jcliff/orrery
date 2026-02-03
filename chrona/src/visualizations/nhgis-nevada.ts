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
      id: 'nhgis-nevada-tracts',
      type: 'geojson',
      url: '/data/nhgis-nevada/tracts.geojson',
    },
    {
      id: 'nhgis-nevada-places',
      type: 'geojson',
      url: '/data/nhgis-nevada/places.geojson',
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
    // Census tracts (show at higher zoom levels, 2000-2020 only)
    {
      id: 'nhgis-nevada-tracts',
      sourceId: 'nhgis-nevada-tracts',
      type: 'circle',
      minzoom: 8,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          8, 3,
          12, 8,
        ],
        'circle-opacity': 0.8,
        'circle-stroke-color': '#333',
        'circle-stroke-width': 1,
      },
      temporal: {
        mode: 'cumulative',
        useGpuFilter: false,
      },
    },
    // Places (cities/towns) - show as larger circles with labels
    {
      id: 'nhgis-nevada-places',
      sourceId: 'nhgis-nevada-places',
      type: 'circle',
      minzoom: 7,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          7, 5,
          10, 12,
        ],
        'circle-opacity': 0.9,
        'circle-stroke-color': '#000',
        'circle-stroke-width': 2,
      },
      temporal: {
        mode: 'cumulative',
        useGpuFilter: false,
      },
    },
    // Place labels
    {
      id: 'nhgis-nevada-places-labels',
      sourceId: 'nhgis-nevada-places',
      type: 'symbol',
      minzoom: 8,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': '#fff',
        'text-halo-width': 1,
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
    layers: ['nhgis-nevada-fill', 'nhgis-nevada-tracts', 'nhgis-nevada-places'],
    render: (props, layerId) => {
      const name = props.name as string;
      const year = props.year as number;
      const totalPop = props.totalPop as number;
      const area = props.area as number;
      const popDensity = props.popDensity as number;
      const county = props.county as string | undefined;

      // Determine the type based on layer
      let typeLabel = 'County';
      if (layerId === 'nhgis-nevada-tracts') {
        typeLabel = `Census Tract${county ? ` (${county} County)` : ''}`;
      } else if (layerId === 'nhgis-nevada-places') {
        typeLabel = 'City/Town';
      }

      return `
        <strong>${name}</strong><br/>
        <em>${typeLabel}</em><br/>
        Census: ${year}<br/>
        Population: ${totalPop.toLocaleString()}<br/>
        ${area > 0 ? `Area: ${area.toLocaleString()} sq mi<br/>` : ''}
        ${popDensity > 0 ? `Density: ${popDensity.toFixed(1)}/sq mi` : ''}
      `;
    },
  },
};
