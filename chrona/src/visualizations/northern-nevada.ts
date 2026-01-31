import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const northernNevadaConfig: VisualizationConfig = {
  id: 'northern-nevada',
  name: 'Northern Nevada Development',

  // Center to show all four counties (Washoe, Carson City, Douglas, Lyon)
  center: [-119.55, 39.35],
  zoom: 8.5,

  timeRange: {
    start: '1860-01-01',
    end: '2026-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    // Washoe County sources (Reno/Sparks)
    {
      id: 'washoe-parcels-aggregated',
      type: 'geojson',
      url: '/data/washoe/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'washoe-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/washoe/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Carson City sources
    {
      id: 'carson-city-parcels-aggregated',
      type: 'geojson',
      url: '/data/carson-city/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'carson-city-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/carson-city/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Douglas County sources (Minden, Gardnerville, Lake Tahoe south shore)
    {
      id: 'douglas-parcels-aggregated',
      type: 'geojson',
      url: '/data/douglas/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'douglas-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/douglas/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Lyon County sources (Fernley, Dayton, Yerington)
    {
      id: 'lyon-parcels-aggregated',
      type: 'geojson',
      url: '/data/lyon/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'lyon-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/lyon/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Storey County sources (Virginia City - historic Comstock Lode)
    {
      id: 'storey-parcels-aggregated',
      type: 'geojson',
      url: '/data/storey/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'storey-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/storey/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
  ],

  layers: [
    // Washoe County layers (zoomed out)
    {
      id: 'washoe-parcels-circles',
      sourceId: 'washoe-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, ['max', 1, ['min', 4, ['/', ['sqrt', ['get', 'area']], 600]]],
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
    // Washoe County layers (zoomed in - PMTiles)
    {
      id: 'washoe-parcels-detailed',
      sourceId: 'washoe-parcels-tiles',
      sourceLayer: 'parcels',
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
    // Carson City layers (zoomed out)
    {
      id: 'carson-city-parcels-circles',
      sourceId: 'carson-city-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, ['max', 1, ['min', 4, ['/', ['sqrt', ['get', 'area']], 600]]],
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
    // Carson City layers (zoomed in - PMTiles)
    {
      id: 'carson-city-parcels-detailed',
      sourceId: 'carson-city-parcels-tiles',
      sourceLayer: 'parcels',
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
    // Douglas County layers (zoomed out)
    {
      id: 'douglas-parcels-circles',
      sourceId: 'douglas-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, ['max', 1, ['min', 4, ['/', ['sqrt', ['get', 'area']], 600]]],
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
    // Douglas County layers (zoomed in - PMTiles)
    {
      id: 'douglas-parcels-detailed',
      sourceId: 'douglas-parcels-tiles',
      sourceLayer: 'parcels',
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
    // Lyon County layers (zoomed out)
    {
      id: 'lyon-parcels-circles',
      sourceId: 'lyon-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, ['max', 1, ['min', 4, ['/', ['sqrt', ['get', 'area']], 600]]],
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
    // Lyon County layers (zoomed in - PMTiles)
    {
      id: 'lyon-parcels-detailed',
      sourceId: 'lyon-parcels-tiles',
      sourceLayer: 'parcels',
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
    // Storey County layers (zoomed out)
    {
      id: 'storey-parcels-circles',
      sourceId: 'storey-parcels-aggregated',
      type: 'circle',
      maxzoom: ZOOM_THRESHOLD,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, ['max', 1, ['min', 4, ['/', ['sqrt', ['get', 'area']], 600]]],
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
    // Storey County layers (zoomed in - PMTiles)
    {
      id: 'storey-parcels-detailed',
      sourceId: 'storey-parcels-tiles',
      sourceLayer: 'parcels',
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
      { label: 'Commercial/Retail', color: '#e74c3c', shape: 'circle' },
      { label: 'Office', color: '#e67e22', shape: 'circle' },
      { label: 'Industrial', color: '#7f8c8d', shape: 'circle' },
      { label: 'Hotel/Casino', color: '#f39c12', shape: 'circle' },
      { label: 'Agricultural', color: '#27ae60', shape: 'circle' },
      { label: 'Government', color: '#2ecc71', shape: 'circle' },
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

  defaultYearRange: [1860, 2025],

  title: {
    text: 'Northern Nevada Urban Development',
    sumProperty: 'count',
    countLabel: 'parcels',
  },

  popup: {
    layers: [
      'washoe-parcels-circles', 'washoe-parcels-detailed',
      'carson-city-parcels-circles', 'carson-city-parcels-detailed',
      'douglas-parcels-circles', 'douglas-parcels-detailed',
      'lyon-parcels-circles', 'lyon-parcels-detailed',
      'storey-parcels-circles', 'storey-parcels-detailed',
    ],
    render: (props) => {
      // Aggregated cluster
      if (props.count && (props.count as number) > 1) {
        return `
          <strong>${props.count} parcels</strong><br/>
          Earliest: ${props.year}${props.estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${props.use || 'Unknown'}
        `;
      }
      // Individual parcel
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
