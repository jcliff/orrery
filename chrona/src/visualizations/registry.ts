import type { VisualizationRegistry } from './types';
import { hurricanesConfig } from './hurricanes';
import { railroadsConfig } from './railroads';
import { sfUrbanConfig } from './sf-urban';
import { paloAltoConfig } from './palo-alto';
import { bayAreaConfig } from './bay-area';
import { clarkCountyConfig } from './clark-county';
import { laCountyConfig } from './la-county';
import { nycConfig } from './nyc';

export const visualizations: VisualizationRegistry = {
  hurricanes: hurricanesConfig,
  railroads: railroadsConfig,
  'sf-urban': sfUrbanConfig,
  'palo-alto': paloAltoConfig,
  'bay-area': bayAreaConfig,
  'clark-county': clarkCountyConfig,
  'la-county': laCountyConfig,
  'nyc': nycConfig,
};
