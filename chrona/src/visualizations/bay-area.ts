import type { VisualizationConfig } from './types';

const ZOOM_THRESHOLD = 15;

export const bayAreaConfig: VisualizationConfig = {
  id: 'bay-area',
  name: 'Bay Area Development',

  // Center on Bay Area (between SF and South Bay/North Bay)
  center: [-122.15, 37.75],
  zoom: 9,

  timeRange: {
    start: '1848-01-01',
    end: '2026-01-01',
  },
  defaultSpeed: 86400 * 365 * 2, // 2 years/sec

  sources: [
    // SF sources
    {
      id: 'sf-buildings',
      type: 'geojson',
      url: '/data/sf-urban/buildings.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'sf-buildings-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/sf-urban/buildings.pmtiles',
      sourceLayer: 'buildings',
      minzoom: ZOOM_THRESHOLD,
    },
    // Palo Alto sources
    {
      id: 'pa-parcels-aggregated',
      type: 'geojson',
      url: '/data/palo-alto/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'pa-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/palo-alto/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Campbell sources
    {
      id: 'campbell-parcels-aggregated',
      type: 'geojson',
      url: '/data/campbell/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'campbell-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/campbell/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Solano County sources
    {
      id: 'solano-parcels-aggregated',
      type: 'geojson',
      url: '/data/solano/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'solano-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/solano/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Livermore sources
    {
      id: 'livermore-parcels-aggregated',
      type: 'geojson',
      url: '/data/livermore/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'livermore-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/livermore/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Santa Clara sources
    {
      id: 'santa-clara-parcels-aggregated',
      type: 'geojson',
      url: '/data/santa-clara/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'santa-clara-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/santa-clara/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Hayward sources
    {
      id: 'hayward-parcels-aggregated',
      type: 'geojson',
      url: '/data/hayward/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'hayward-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/hayward/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Sonoma County sources
    {
      id: 'sonoma-parcels-aggregated',
      type: 'geojson',
      url: '/data/sonoma/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'sonoma-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/sonoma/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Santa Rosa sources
    {
      id: 'santa-rosa-parcels-aggregated',
      type: 'geojson',
      url: '/data/santa-rosa/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'santa-rosa-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/santa-rosa/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Pittsburg sources
    {
      id: 'pittsburg-parcels-aggregated',
      type: 'geojson',
      url: '/data/pittsburg/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'pittsburg-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/pittsburg/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Walnut Creek sources
    {
      id: 'walnut-creek-parcels-aggregated',
      type: 'geojson',
      url: '/data/walnut-creek/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'walnut-creek-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/walnut-creek/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Brentwood sources
    {
      id: 'brentwood-parcels-aggregated',
      type: 'geojson',
      url: '/data/brentwood/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'brentwood-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/brentwood/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
    // Berkeley sources
    {
      id: 'berkeley-parcels-aggregated',
      type: 'geojson',
      url: '/data/berkeley/parcels.geojson',
      maxzoom: ZOOM_THRESHOLD,
    },
    {
      id: 'berkeley-parcels-tiles',
      type: 'pmtiles',
      url: 'pmtiles:///data/berkeley/parcels.pmtiles',
      sourceLayer: 'parcels',
      minzoom: ZOOM_THRESHOLD,
    },
  ],

  layers: [
    // SF layers (zoomed out)
    {
      id: 'sf-buildings-layer',
      sourceId: 'sf-buildings',
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
    // SF layers (zoomed in - PMTiles)
    {
      id: 'sf-buildings-detailed-layer',
      sourceId: 'sf-buildings-tiles',
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
    // Palo Alto layers (zoomed out)
    {
      id: 'pa-parcels-circles',
      sourceId: 'pa-parcels-aggregated',
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
    // Palo Alto layers (zoomed in - PMTiles)
    {
      id: 'pa-parcels-detailed',
      sourceId: 'pa-parcels-tiles',
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
    // Campbell layers (zoomed out)
    {
      id: 'campbell-parcels-circles',
      sourceId: 'campbell-parcels-aggregated',
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
    // Campbell layers (zoomed in - PMTiles)
    {
      id: 'campbell-parcels-detailed',
      sourceId: 'campbell-parcels-tiles',
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
    // Solano County layers (zoomed out)
    {
      id: 'solano-parcels-circles',
      sourceId: 'solano-parcels-aggregated',
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
    // Solano County layers (zoomed in - PMTiles)
    {
      id: 'solano-parcels-detailed',
      sourceId: 'solano-parcels-tiles',
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
    // Livermore layers (zoomed out)
    {
      id: 'livermore-parcels-circles',
      sourceId: 'livermore-parcels-aggregated',
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
    // Livermore layers (zoomed in - PMTiles)
    {
      id: 'livermore-parcels-detailed',
      sourceId: 'livermore-parcels-tiles',
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
    // Santa Clara layers (zoomed out)
    {
      id: 'santa-clara-parcels-circles',
      sourceId: 'santa-clara-parcels-aggregated',
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
    // Santa Clara layers (zoomed in - PMTiles)
    {
      id: 'santa-clara-parcels-detailed',
      sourceId: 'santa-clara-parcels-tiles',
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
    // Hayward layers (zoomed out)
    {
      id: 'hayward-parcels-circles',
      sourceId: 'hayward-parcels-aggregated',
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
    // Hayward layers (zoomed in - PMTiles)
    {
      id: 'hayward-parcels-detailed',
      sourceId: 'hayward-parcels-tiles',
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
    // Sonoma County layers (zoomed out)
    {
      id: 'sonoma-parcels-circles',
      sourceId: 'sonoma-parcels-aggregated',
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
    // Sonoma County layers (zoomed in - PMTiles)
    {
      id: 'sonoma-parcels-detailed',
      sourceId: 'sonoma-parcels-tiles',
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
    // Santa Rosa layers (zoomed out)
    {
      id: 'santa-rosa-parcels-circles',
      sourceId: 'santa-rosa-parcels-aggregated',
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
    // Santa Rosa layers (zoomed in - PMTiles)
    {
      id: 'santa-rosa-parcels-detailed',
      sourceId: 'santa-rosa-parcels-tiles',
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
    // Pittsburg layers (zoomed out)
    {
      id: 'pittsburg-parcels-circles',
      sourceId: 'pittsburg-parcels-aggregated',
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
    // Pittsburg layers (zoomed in - PMTiles)
    {
      id: 'pittsburg-parcels-detailed',
      sourceId: 'pittsburg-parcels-tiles',
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
    // Walnut Creek layers (zoomed out)
    {
      id: 'walnut-creek-parcels-circles',
      sourceId: 'walnut-creek-parcels-aggregated',
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
    // Walnut Creek layers (zoomed in - PMTiles)
    {
      id: 'walnut-creek-parcels-detailed',
      sourceId: 'walnut-creek-parcels-tiles',
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
    // Brentwood layers (zoomed out)
    {
      id: 'brentwood-parcels-circles',
      sourceId: 'brentwood-parcels-aggregated',
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
    // Brentwood layers (zoomed in - PMTiles)
    {
      id: 'brentwood-parcels-detailed',
      sourceId: 'brentwood-parcels-tiles',
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
    // Berkeley layers (zoomed out)
    {
      id: 'berkeley-parcels-circles',
      sourceId: 'berkeley-parcels-aggregated',
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
    // Berkeley layers (zoomed in - PMTiles)
    {
      id: 'berkeley-parcels-detailed',
      sourceId: 'berkeley-parcels-tiles',
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
      { label: 'Agricultural', color: '#27ae60', shape: 'circle' },
      { label: 'Public/Gov', color: '#2ecc71', shape: 'circle' },
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

  defaultYearRange: [1848, 2025],

  title: {
    text: 'Bay Area Urban Development',
    sumProperty: 'count',
    countLabel: 'buildings',
  },

  popup: {
    layers: [
      'sf-buildings-layer', 'sf-buildings-detailed-layer',
      'pa-parcels-circles', 'pa-parcels-detailed',
      'campbell-parcels-circles', 'campbell-parcels-detailed',
      'solano-parcels-circles', 'solano-parcels-detailed',
      'livermore-parcels-circles', 'livermore-parcels-detailed',
      'santa-clara-parcels-circles', 'santa-clara-parcels-detailed',
      'hayward-parcels-circles', 'hayward-parcels-detailed',
      'sonoma-parcels-circles', 'sonoma-parcels-detailed',
      'santa-rosa-parcels-circles', 'santa-rosa-parcels-detailed',
      'pittsburg-parcels-circles', 'pittsburg-parcels-detailed',
      'walnut-creek-parcels-circles', 'walnut-creek-parcels-detailed',
      'brentwood-parcels-circles', 'brentwood-parcels-detailed',
      'berkeley-parcels-circles', 'berkeley-parcels-detailed',
    ],
    render: (props) => {
      // Aggregated cluster
      if (props.count && (props.count as number) > 1) {
        return `
          <strong>${props.count} ${props.apn ? 'parcels' : 'buildings'}</strong><br/>
          Earliest: ${props.year}${props.estimated ? ' (includes estimates)' : ''}<br/>
          Primary use: ${props.use || 'Unknown'}
        `;
      }
      // Individual building/parcel
      const address = props.address || '';
      const year = props.year;
      const estimated = props.estimated;
      const use = props.use;
      const neighborhood = props.neighborhood || '';
      const apn = props.apn;
      return `
        ${address ? `<strong>${address}</strong><br/>` : ''}
        Built: ${estimated ? '~' : ''}${year}${estimated ? ' (est.)' : ''}
        ${use ? `<br/>Use: ${use}` : ''}
        ${neighborhood ? `<br/>${neighborhood}` : ''}
        ${apn ? `<br/><small>APN: ${apn}</small>` : ''}
      `;
    },
  },
};
