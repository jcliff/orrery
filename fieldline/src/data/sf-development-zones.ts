/**
 * San Francisco historical development zones.
 *
 * Each zone defines a timeline for when buildings were likely constructed,
 * based on historical research of infrastructure development (cable cars,
 * streetcars), landfill operations, and post-1906 earthquake rebuilding.
 *
 * These zones are used to generate plausible synthetic construction dates
 * for buildings that lack accurate records.
 *
 * Sources:
 * - FoundSF (foundsf.org)
 * - Western Neighborhoods Project (outsidelands.org)
 * - SF Planning Historic Context Statements
 * - Library of Congress Sanborn Maps (1886-1899)
 */

export interface DevelopmentZone {
  id: string;
  name: string;

  /** SF OpenData analysis_neighborhood values that map to this zone */
  neighborhoods: string[];

  /** Year first buildings appeared */
  firstDeveloped: number;

  /** Year building boom began */
  rapidGrowthStart: number;

  /** Year most lots were filled */
  rapidGrowthEnd: number;

  /** Year development essentially complete */
  builtOut: number;

  /** Whether zone was inside 1906 fire boundary */
  inFireZone: boolean;

  /** Terrain affects development timing */
  terrain: 'flat' | 'moderate_hill' | 'steep_hill' | 'filled_land';

  /** How confident we are in these dates */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Development zones ordered roughly by development date.
 * Zones are matched by neighborhood name from SF OpenData.
 */
export const DEVELOPMENT_ZONES: DevelopmentZone[] = [
  // === EARLIEST DEVELOPMENT (1835-1870) ===
  {
    id: 'financial-district',
    name: 'Financial District / Downtown',
    neighborhoods: ['Financial District/South Beach'],
    firstDeveloped: 1847,
    rapidGrowthStart: 1849,
    rapidGrowthEnd: 1870,
    builtOut: 1930, // Extended due to 1906 fire rebuild
    inFireZone: true,
    terrain: 'filled_land',
    confidence: 'high',
  },
  {
    id: 'chinatown',
    name: 'Chinatown',
    neighborhoods: ['Chinatown'],
    firstDeveloped: 1850,
    rapidGrowthStart: 1852,
    rapidGrowthEnd: 1880,
    builtOut: 1925, // Extended due to 1906 fire rebuild
    inFireZone: true,
    terrain: 'moderate_hill',
    confidence: 'high',
  },
  {
    id: 'north-beach',
    name: 'North Beach',
    neighborhoods: ['North Beach'],
    firstDeveloped: 1850,
    rapidGrowthStart: 1860,
    rapidGrowthEnd: 1890,
    builtOut: 1910,
    inFireZone: true,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'russian-hill',
    name: 'Russian Hill',
    neighborhoods: ['Russian Hill'],
    firstDeveloped: 1875,
    rapidGrowthStart: 1885,
    rapidGrowthEnd: 1905,
    builtOut: 1920,
    inFireZone: true, // partial - pocket survived
    terrain: 'steep_hill',
    confidence: 'medium',
  },
  {
    id: 'nob-hill',
    name: 'Nob Hill',
    neighborhoods: ['Nob Hill'],
    firstDeveloped: 1870,
    rapidGrowthStart: 1878, // California St Cable Railroad
    rapidGrowthEnd: 1895,
    builtOut: 1920,
    inFireZone: true,
    terrain: 'steep_hill',
    confidence: 'high',
  },
  {
    id: 'telegraph-hill',
    name: 'Telegraph Hill',
    neighborhoods: [], // Part of North Beach in SF data
    firstDeveloped: 1850,
    rapidGrowthStart: 1870,
    rapidGrowthEnd: 1900,
    builtOut: 1920,
    inFireZone: true,
    terrain: 'steep_hill',
    confidence: 'medium',
  },

  // === VICTORIAN ERA (1870-1906) ===
  {
    id: 'soma',
    name: 'South of Market',
    neighborhoods: ['South of Market'],
    firstDeveloped: 1855,
    rapidGrowthStart: 1865,
    rapidGrowthEnd: 1890,
    builtOut: 1930, // Extended due to 1906 fire rebuild
    inFireZone: true,
    terrain: 'filled_land',
    confidence: 'medium',
  },
  {
    id: 'tenderloin',
    name: 'Tenderloin',
    neighborhoods: ['Tenderloin'],
    firstDeveloped: 1870,
    rapidGrowthStart: 1880,
    rapidGrowthEnd: 1905,
    builtOut: 1930, // Extended due to 1906 fire rebuild
    inFireZone: true,
    terrain: 'flat',
    confidence: 'medium',
  },
  {
    id: 'western-addition',
    name: 'Western Addition',
    neighborhoods: ['Western Addition'],
    firstDeveloped: 1865,
    rapidGrowthStart: 1875,
    rapidGrowthEnd: 1895,
    builtOut: 1905,
    inFireZone: false, // Survived! West of Van Ness
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'pacific-heights',
    name: 'Pacific Heights',
    neighborhoods: ['Pacific Heights'],
    firstDeveloped: 1873,
    rapidGrowthStart: 1885,
    rapidGrowthEnd: 1910,
    builtOut: 1925,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high',
  },
  {
    id: 'hayes-valley',
    name: 'Hayes Valley',
    neighborhoods: ['Hayes Valley'],
    firstDeveloped: 1870,
    rapidGrowthStart: 1880,
    rapidGrowthEnd: 1900,
    builtOut: 1915,
    inFireZone: false, // Western part survived
    terrain: 'flat',
    confidence: 'medium',
  },
  {
    id: 'mission',
    name: 'Mission District',
    neighborhoods: ['Mission'],
    firstDeveloped: 1860,
    rapidGrowthStart: 1875,
    rapidGrowthEnd: 1905,
    builtOut: 1920,
    inFireZone: false, // Only northern tip burned
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'potrero-hill',
    name: 'Potrero Hill',
    neighborhoods: ['Potrero Hill'],
    firstDeveloped: 1867,
    rapidGrowthStart: 1885,
    rapidGrowthEnd: 1915,
    builtOut: 1940,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },

  // === CABLE CAR ERA (1889-1910) ===
  {
    id: 'castro',
    name: 'Castro / Upper Market',
    neighborhoods: ['Castro/Upper Market'],
    firstDeveloped: 1880,
    rapidGrowthStart: 1889, // Market St Cable to Castro
    rapidGrowthEnd: 1910,
    builtOut: 1925,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high',
  },
  {
    id: 'noe-valley',
    name: 'Noe Valley',
    neighborhoods: ['Noe Valley'],
    firstDeveloped: 1885,
    rapidGrowthStart: 1895,
    rapidGrowthEnd: 1915,
    builtOut: 1930,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'glen-park',
    name: 'Glen Park',
    neighborhoods: ['Glen Park'],
    firstDeveloped: 1890,
    rapidGrowthStart: 1905,
    rapidGrowthEnd: 1925,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },
  {
    id: 'bernal-heights',
    name: 'Bernal Heights',
    neighborhoods: ['Bernal Heights'],
    firstDeveloped: 1880,
    rapidGrowthStart: 1900,
    rapidGrowthEnd: 1920,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'steep_hill',
    confidence: 'medium',
  },
  {
    id: 'haight-ashbury',
    name: 'Haight Ashbury',
    neighborhoods: ['Haight Ashbury'],
    firstDeveloped: 1880,
    rapidGrowthStart: 1890,
    rapidGrowthEnd: 1905,
    builtOut: 1915,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high',
  },

  // === POST-EARTHQUAKE SUBURBS (1906-1930) ===
  {
    id: 'inner-richmond',
    name: 'Inner Richmond',
    neighborhoods: ['Inner Richmond'],
    firstDeveloped: 1890,
    rapidGrowthStart: 1906, // Earthquake refugees
    rapidGrowthEnd: 1920,
    builtOut: 1930,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'outer-richmond',
    name: 'Outer Richmond',
    neighborhoods: ['Outer Richmond'],
    firstDeveloped: 1905,
    rapidGrowthStart: 1915,
    rapidGrowthEnd: 1928,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'inner-sunset',
    name: 'Inner Sunset',
    neighborhoods: ['Inner Sunset'],
    firstDeveloped: 1900,
    rapidGrowthStart: 1910,
    rapidGrowthEnd: 1930,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'outer-sunset',
    name: 'Outer Sunset',
    neighborhoods: ['Outer Sunset'],
    firstDeveloped: 1915,
    rapidGrowthStart: 1925,
    rapidGrowthEnd: 1945,
    builtOut: 1960,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'parkside',
    name: 'Parkside',
    neighborhoods: [], // Part of Outer Sunset in SF data
    firstDeveloped: 1920,
    rapidGrowthStart: 1928,
    rapidGrowthEnd: 1945,
    builtOut: 1955,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'excelsior',
    name: 'Excelsior',
    neighborhoods: ['Excelsior'],
    firstDeveloped: 1905,
    rapidGrowthStart: 1915,
    rapidGrowthEnd: 1935,
    builtOut: 1955,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },
  {
    id: 'visitacion-valley',
    name: 'Visitacion Valley',
    neighborhoods: ['Visitacion Valley'],
    firstDeveloped: 1910,
    rapidGrowthStart: 1925,
    rapidGrowthEnd: 1945,
    builtOut: 1965,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },
  {
    id: 'bayview',
    name: 'Bayview Hunters Point',
    neighborhoods: ['Bayview Hunters Point'],
    firstDeveloped: 1900,
    rapidGrowthStart: 1940, // WWII shipyards
    rapidGrowthEnd: 1955,
    builtOut: 1970,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },
  {
    id: 'crocker-amazon',
    name: 'Crocker Amazon',
    neighborhoods: ['Crocker Amazon'],
    firstDeveloped: 1920,
    rapidGrowthStart: 1935,
    rapidGrowthEnd: 1955,
    builtOut: 1970,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'medium',
  },
  {
    id: 'oceanview',
    name: 'Oceanview / Merced / Ingleside',
    neighborhoods: ['Oceanview/Merced/Ingleside'],
    firstDeveloped: 1910,
    rapidGrowthStart: 1925,
    rapidGrowthEnd: 1950,
    builtOut: 1965,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },

  // === LATER DEVELOPMENT (1910-1940) ===
  {
    id: 'marina',
    name: 'Marina',
    neighborhoods: ['Marina'],
    firstDeveloped: 1915, // Built on 1915 Expo fill
    rapidGrowthStart: 1920,
    rapidGrowthEnd: 1935,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'filled_land',
    confidence: 'high',
  },
  {
    id: 'presidio-heights',
    name: 'Presidio Heights',
    neighborhoods: ['Presidio Heights'],
    firstDeveloped: 1905,
    rapidGrowthStart: 1915,
    rapidGrowthEnd: 1935,
    builtOut: 1950,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high',
  },
  {
    id: 'lone-mountain',
    name: 'Lone Mountain / USF',
    neighborhoods: ['Lone Mountain/USF'],
    firstDeveloped: 1895,
    rapidGrowthStart: 1910,
    rapidGrowthEnd: 1930,
    builtOut: 1950,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },
  {
    id: 'west-portal',
    name: 'West of Twin Peaks',
    neighborhoods: ['West of Twin Peaks'],
    firstDeveloped: 1917, // Twin Peaks Tunnel opened
    rapidGrowthStart: 1920,
    rapidGrowthEnd: 1945,
    builtOut: 1960,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high',
  },
  {
    id: 'twin-peaks',
    name: 'Twin Peaks',
    neighborhoods: ['Twin Peaks'],
    firstDeveloped: 1920,
    rapidGrowthStart: 1930,
    rapidGrowthEnd: 1955,
    builtOut: 1970,
    inFireZone: false,
    terrain: 'steep_hill',
    confidence: 'medium',
  },
  {
    id: 'diamond-heights',
    name: 'Diamond Heights',
    neighborhoods: ['Diamond Heights'],
    firstDeveloped: 1960,
    rapidGrowthStart: 1962,
    rapidGrowthEnd: 1975,
    builtOut: 1985,
    inFireZone: false,
    terrain: 'steep_hill',
    confidence: 'high',
  },
  {
    id: 'lakeshore',
    name: 'Lakeshore',
    neighborhoods: ['Lakeshore'],
    firstDeveloped: 1920,
    rapidGrowthStart: 1935,
    rapidGrowthEnd: 1955,
    builtOut: 1970,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'medium',
  },
  {
    id: 'seacliff',
    name: 'Seacliff',
    neighborhoods: ['Seacliff'],
    firstDeveloped: 1913,
    rapidGrowthStart: 1920,
    rapidGrowthEnd: 1940,
    builtOut: 1955,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high',
  },
  {
    id: 'japantown',
    name: 'Japantown',
    neighborhoods: ['Japantown'],
    firstDeveloped: 1870,
    rapidGrowthStart: 1880,
    rapidGrowthEnd: 1905,
    builtOut: 1920,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'medium',
  },

  // === SPECIAL / MODERN ===
  {
    id: 'mission-bay',
    name: 'Mission Bay',
    neighborhoods: ['Mission Bay'],
    firstDeveloped: 1870, // Industrial only
    rapidGrowthStart: 2000, // Modern residential
    rapidGrowthEnd: 2020,
    builtOut: 2030,
    inFireZone: false,
    terrain: 'filled_land',
    confidence: 'high',
  },
  {
    id: 'treasure-island',
    name: 'Treasure Island',
    neighborhoods: ['Treasure Island'],
    firstDeveloped: 1939, // Created for 1939 Expo
    rapidGrowthStart: 2015,
    rapidGrowthEnd: 2035,
    builtOut: 2045,
    inFireZone: false,
    terrain: 'filled_land',
    confidence: 'high',
  },
  {
    id: 'presidio',
    name: 'Presidio',
    neighborhoods: ['Presidio'],
    firstDeveloped: 1776,
    rapidGrowthStart: 1850,
    rapidGrowthEnd: 1945,
    builtOut: 1960,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },
  {
    id: 'golden-gate-park',
    name: 'Golden Gate Park',
    neighborhoods: ['Golden Gate Park'],
    firstDeveloped: 1870,
    rapidGrowthStart: 1880,
    rapidGrowthEnd: 1920,
    builtOut: 1940,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high',
  },
  {
    id: 'lincoln-park',
    name: 'Lincoln Park',
    neighborhoods: ['Lincoln Park'],
    firstDeveloped: 1900,
    rapidGrowthStart: 1910,
    rapidGrowthEnd: 1930,
    builtOut: 1950,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium',
  },
  {
    id: 'mclaren-park',
    name: 'McLaren Park',
    neighborhoods: ['McLaren Park'],
    firstDeveloped: 1930,
    rapidGrowthStart: 1950,
    rapidGrowthEnd: 1970,
    builtOut: 1990,
    inFireZone: false,
    terrain: 'steep_hill',
    confidence: 'low',
  },
];

/**
 * Build lookup from neighborhood name to development zone.
 */
export function buildNeighborhoodZoneMap(): Map<string, DevelopmentZone> {
  const map = new Map<string, DevelopmentZone>();
  for (const zone of DEVELOPMENT_ZONES) {
    for (const neighborhood of zone.neighborhoods) {
      map.set(neighborhood, zone);
    }
  }
  return map;
}

/**
 * Default zone for unknown neighborhoods.
 * Uses conservative middle-era estimates.
 */
export const DEFAULT_ZONE: DevelopmentZone = {
  id: 'unknown',
  name: 'Unknown',
  neighborhoods: [],
  firstDeveloped: 1880,
  rapidGrowthStart: 1900,
  rapidGrowthEnd: 1930,
  builtOut: 1960,
  inFireZone: false,
  terrain: 'flat',
  confidence: 'low',
};
