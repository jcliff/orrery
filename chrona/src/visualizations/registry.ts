import type { VisualizationRegistry } from './types';
import { hurricanesConfig } from './hurricanes';
import { railroadsConfig } from './railroads';
import { sfUrbanConfig } from './sf-urban';
import { paloAltoConfig } from './palo-alto';

export const visualizations: VisualizationRegistry = {
  hurricanes: hurricanesConfig,
  railroads: railroadsConfig,
  'sf-urban': sfUrbanConfig,
  'palo-alto': paloAltoConfig,
};
