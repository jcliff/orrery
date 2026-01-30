import type {
  LayerSpecification,
  FilterSpecification,
  DataDrivenPropertyValueSpecification,
} from 'maplibre-gl';

export interface DataSource {
  id: string;
  type: 'geojson' | 'pmtiles';
  url: string;
  /** For pmtiles, the layer name in the vector tiles */
  sourceLayer?: string;
  /** Zoom range for this source (for LOD switching) */
  minzoom?: number;
  maxzoom?: number;
}

export interface LayerConfig {
  id: string;
  sourceId: string;
  type: 'circle' | 'line' | 'fill';
  /** For vector sources, the source-layer name */
  sourceLayer?: string;
  /** Zoom range for this layer */
  minzoom?: number;
  maxzoom?: number;
  /** MapLibre paint properties */
  paint: Record<string, unknown>;
  /** MapLibre layout properties */
  layout?: Record<string, unknown>;
  /** Temporal filtering settings */
  temporal?: {
    /** 'cumulative' shows all data up to current time, 'active' shows recent only */
    mode: 'cumulative' | 'active';
    /** For 'active' mode: time window for fading (in years or months) */
    fadeYears?: number;
    fadeMonths?: number;
    /** Whether to use GPU-evaluated filters (for large datasets) */
    useGpuFilter?: boolean;
  };
}

export interface LegendItem {
  label: string;
  color: string;
  /** 'line' for track visualizations, 'circle' for points */
  shape?: 'line' | 'circle' | 'square';
}

export interface SpeedOption {
  label: string;
  /** Speed in simulated seconds per real second */
  value: number;
}

export interface PopupConfig {
  /** Fields to show in popup */
  fields: Array<{
    key: string;
    label: string;
    /** Format function name or 'number', 'date' */
    format?: string;
  }>;
}

export interface VisualizationConfig {
  id: string;
  name: string;

  /** Map defaults */
  center: [number, number];
  zoom: number;

  /** Timeline settings */
  timeRange: {
    start: string; // ISO date
    end: string;   // ISO date
  };
  /** Speed in simulated seconds per real second */
  defaultSpeed: number;
  /** Optional season constraint (0-indexed months) */
  seasonMonths?: [number, number];

  /** Data sources */
  sources: DataSource[];

  /** Map layers */
  layers: LayerConfig[];

  /** Legend configuration */
  legend: {
    title: string;
    items: LegendItem[];
  };

  /** Timeline control settings */
  controls: {
    /** 'full' shows year range sliders, 'compact' is a bottom bar */
    variant: 'full' | 'compact';
    speedOptions: SpeedOption[];
    /** Whether to show year range selectors */
    showYearRange?: boolean;
    /** Whether to show accumulate/fade toggle */
    showAccumulateToggle?: boolean;
    /** Whether to show month in the date display */
    showMonth?: boolean;
  };

  /** Default year range for filtering */
  defaultYearRange?: [number, number];

  /** Title overlay configuration */
  title: {
    text: string;
    /** Property path to count (e.g., 'stormId' for unique storms) */
    countProperty?: string;
    countLabel?: string;
    /** For aggregated data, sum this property instead of counting features */
    sumProperty?: string;
  };

  /** Optional popup configuration */
  popup?: {
    layers: string[];
    render: (properties: Record<string, unknown>) => string;
  };
}

/** Registry mapping visualization IDs to their configs */
export type VisualizationRegistry = Record<string, VisualizationConfig>;
