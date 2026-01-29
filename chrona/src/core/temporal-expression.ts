import type {
  FilterSpecification,
  DataDrivenPropertyValueSpecification,
} from 'maplibre-gl';

export interface TemporalFilterOptions {
  /** 'cumulative' shows all features up to currentYear, 'active' shows recent only */
  mode: 'cumulative' | 'active';
  /** For 'active' mode: how many years back to show (default 20) */
  fadeYears?: number;
  /** Property name containing the year (default 'year') */
  yearProperty?: string;
}

/**
 * GPU-evaluated filter for temporal data.
 * Use with map.setFilter() instead of source.setData() for 60fps performance.
 *
 * @example
 * // Show all buildings up to 1920
 * map.setFilter('buildings', createTemporalFilter(1920));
 *
 * // Show only buildings from last 20 years
 * map.setFilter('buildings', createTemporalFilter(1950, { mode: 'active', fadeYears: 20 }));
 */
export function createTemporalFilter(
  currentYear: number,
  options: TemporalFilterOptions = { mode: 'cumulative' }
): FilterSpecification {
  const yearProp = options.yearProperty ?? 'year';

  if (options.mode === 'cumulative') {
    return ['<=', ['get', yearProp], currentYear];
  }

  // Active mode: show features from (currentYear - fadeYears) to currentYear
  const fadeYears = options.fadeYears ?? 20;
  return [
    'all',
    ['<=', ['get', yearProp], currentYear],
    ['>', ['get', yearProp], currentYear - fadeYears],
  ];
}

/**
 * GPU-evaluated opacity expression for age-based fading.
 * Newer features are more opaque, older ones fade out.
 *
 * @example
 * map.setPaintProperty('buildings', 'circle-opacity', createOpacityExpression(1950, 20));
 */
export function createOpacityExpression(
  currentYear: number,
  fadeYears: number = 20,
  options: { yearProperty?: string; maxOpacity?: number; minOpacity?: number } = {}
): DataDrivenPropertyValueSpecification<number> {
  const yearProp = options.yearProperty ?? 'year';
  const maxOpacity = options.maxOpacity ?? 0.9;
  const minOpacity = options.minOpacity ?? 0.3;

  return [
    'interpolate',
    ['linear'],
    ['-', currentYear, ['get', yearProp]],
    0,
    maxOpacity,
    fadeYears,
    minOpacity,
  ];
}

/**
 * Combined filter that also applies year range bounds.
 * Useful when UI has both timeline and year range controls.
 */
export function createTemporalFilterWithRange(
  currentYear: number,
  yearRange: [number, number],
  options: TemporalFilterOptions = { mode: 'cumulative' }
): FilterSpecification {
  const yearProp = options.yearProperty ?? 'year';
  const [minYear, maxYear] = yearRange;

  if (options.mode === 'active') {
    const fadeYears = options.fadeYears ?? 20;
    return [
      'all',
      ['>=', ['get', yearProp], minYear],
      ['<=', ['get', yearProp], maxYear],
      ['<=', ['get', yearProp], currentYear],
      ['>', ['get', yearProp], currentYear - fadeYears],
    ];
  }

  return [
    'all',
    ['>=', ['get', yearProp], minYear],
    ['<=', ['get', yearProp], maxYear],
    ['<=', ['get', yearProp], currentYear],
  ];
}
