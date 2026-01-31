/**
 * Nevada Assessor Land Use Code utilities.
 *
 * Based on Nevada Tax Commission Land Use Code Manual:
 * https://tax.nv.gov/wp-content/uploads/2024/06/2017-18_Land_Use_Code_Manual.pdf
 *
 * Code ranges:
 * - 10-19 (100s): Vacant
 * - 20-29 (200s): Residential
 * - 30-39 (300s): Commercial
 * - 40-49 (400s): Industrial
 * - 50-59 (500s): Industrial (general/commercial)
 * - 60-69 (600s): Rural/Agricultural
 * - 70-79 (700s): Mining
 * - 80-89 (800s): Government/Public
 */

// Land use code to color mapping
export const USE_COLORS: Record<string, string> = {
  // Residential (200s)
  '200': '#3498db', '210': '#9b59b6', '220': '#8e44ad', '230': '#9b59b6',
  '240': '#a569bd', '250': '#e67e22',
  // Vacant (100s)
  '100': '#bdc3c7', '110': '#bdc3c7', '120': '#bdc3c7', '170': '#bdc3c7', '190': '#bdc3c7',
  // Commercial (300s)
  '300': '#e74c3c', '310': '#e74c3c', '320': '#e67e22', '330': '#f39c12',
  '340': '#d63031', '350': '#e74c3c',
  // Industrial (400s)
  '400': '#7f8c8d', '410': '#7f8c8d', '420': '#7f8c8d', '430': '#95a5a6', '440': '#7f8c8d',
  // Industrial (500s)
  '500': '#7f8c8d', '510': '#95a5a6', '520': '#7f8c8d',
  // Agricultural (600s)
  '600': '#27ae60', '670': '#27ae60',
  // Mining (700s)
  '700': '#95a5a6', '710': '#95a5a6',
  // Government (800s)
  '800': '#2ecc71', '810': '#2ecc71',
};

// Land use code to label mapping
export const USE_LABELS: Record<string, string> = {
  // Residential
  '200': 'Single Family', '210': 'Multi-Family', '220': 'Apartments',
  '230': 'Townhouse', '240': 'Condo', '250': 'Mobile Home',
  // Vacant
  '100': 'Vacant', '110': 'Vacant', '120': 'Vacant', '170': 'Vacant', '190': 'Vacant',
  // Commercial
  '300': 'Commercial', '310': 'Retail', '320': 'Office', '330': 'Hotel',
  '340': 'Casino', '350': 'Shopping Center',
  // Industrial
  '400': 'Industrial', '410': 'Light Industrial', '420': 'Heavy Industrial',
  '430': 'Warehouse', '440': 'Manufacturing', '500': 'Industrial',
  '510': 'Warehouse/Distribution', '520': 'Industrial',
  // Agricultural
  '600': 'Agricultural', '670': 'Ranch',
  // Mining
  '700': 'Mining', '710': 'Mining',
  // Government
  '800': 'Government', '810': 'Government',
};

// Label to color mapping (for aggregated features)
export const LABEL_COLORS: Record<string, string> = {
  'Single Family': '#3498db', 'Multi-Family': '#9b59b6', 'Townhouse': '#9b59b6',
  'Condo': '#a569bd', 'Apartments': '#8e44ad', 'Mobile Home': '#e67e22',
  'Commercial': '#e74c3c', 'Retail': '#e74c3c', 'Office': '#e67e22',
  'Hotel': '#f39c12', 'Casino': '#d63031', 'Shopping Center': '#e74c3c',
  'Industrial': '#7f8c8d', 'Light Industrial': '#7f8c8d', 'Heavy Industrial': '#7f8c8d',
  'Warehouse': '#95a5a6', 'Warehouse/Distribution': '#95a5a6', 'Manufacturing': '#7f8c8d',
  'Vacant': '#bdc3c7', 'Agricultural': '#27ae60', 'Ranch': '#27ae60',
  'Mining': '#95a5a6', 'Government': '#2ecc71', 'Religious': '#16a085', 'Mixed Use': '#1abc9c',
};

// Fallback colors by first digit of code
const PREFIX_COLORS: Record<string, string> = {
  '1': '#bdc3c7', '2': '#3498db', '3': '#e74c3c', '4': '#7f8c8d',
  '5': '#7f8c8d', '6': '#27ae60', '7': '#95a5a6', '8': '#2ecc71',
};

// Fallback labels by first digit of code
const PREFIX_LABELS: Record<string, string> = {
  '1': 'Vacant', '2': 'Residential', '3': 'Commercial', '4': 'Industrial',
  '5': 'Industrial', '6': 'Agricultural', '7': 'Mining', '8': 'Government',
};

const DEFAULT_COLOR = '#95a5a6';
const DEFAULT_LABEL = 'Unknown';

/**
 * Get the display color for a Nevada land use code.
 * Handles comma-separated codes (uses first) and falls back to category by prefix.
 */
export function getUseColor(use: string | null): string {
  if (!use) return DEFAULT_COLOR;
  const code = String(use).split(',')[0].trim();
  return USE_COLORS[code] ?? PREFIX_COLORS[code.charAt(0)] ?? DEFAULT_COLOR;
}

/**
 * Get the display label for a Nevada land use code.
 * Handles comma-separated codes (uses first) and falls back to category by prefix.
 */
export function getUseLabel(use: string | null): string {
  if (!use) return DEFAULT_LABEL;
  const code = String(use).split(',')[0].trim();
  return USE_LABELS[code] ?? PREFIX_LABELS[code.charAt(0)] ?? DEFAULT_LABEL;
}

/**
 * Get the color for a use label (for aggregated features).
 */
export function getLabelColor(label: string): string {
  return LABEL_COLORS[label] ?? DEFAULT_COLOR;
}
