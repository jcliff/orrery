# SF Building Synthetic Date Generation Strategy

## Executive Summary

This document outlines a strategy for generating plausible "first developed" dates for San Francisco buildings that lack accurate construction records. The approach combines historical research with a multi-factor algorithm that considers:

1. **Historical development zones** - Neighborhood-specific date ranges
2. **1906 fire boundary** - Mandatory post-1906 rebuild dates inside the burn zone
3. **Distance attenuation** - Proximity to historical centers affects likely development date
4. **Terrain factors** - Hills developed later; filled land has specific timelines
5. **Infrastructure timelines** - Cable car and streetcar lines enabled development

---

## Part 1: Historical Research Summary

### Origins and Earliest Development (1776-1848)

| Area | First Developed | Notes |
|------|-----------------|-------|
| Mission Dolores | 1776 | Spanish mission, earliest permanent structure |
| Yerba Buena / Portsmouth Square | 1835-1846 | Mexican-era trading settlement |
| Waterfront (pre-fill) | 1847-1849 | Wharves and basic structures |

### Gold Rush Expansion (1848-1860)

Population exploded from ~1,000 (1848) to 25,000 (1849) to 56,000 (1860).

**Development pattern:**
- Radiated outward from Portsmouth Square and waterfront
- Yerba Buena Cove began filling (ships sunk for land claims)
- Rincon Hill and South Park emerged as first elite residential (1850s-1860s)
- Mission District platted (1850s) but remained largely undeveloped

### Victorian Expansion Era (1860-1906)

**Cable cars (1873+) unlocked hill neighborhoods:**

| Neighborhood | Development Period | Key Catalyst |
|--------------|-------------------|--------------|
| Western Addition | 1870-1890 | Cable cars crossed hills (1877+) |
| Nob Hill | 1870s-1880s | California Street Cable Railroad (1878) |
| Russian Hill | 1880s-1890s | Cable car access |
| Pacific Heights | 1880s-1900s | Cable car + electric streetcar |
| Mission District | 1870s-1900s | Horse car lines, later electric |
| Castro/Upper Market | 1889-1910 | Market Street Cable Railway to Castro (1889) |
| Noe Valley | 1890s-1910s | Castro Street cable car extension |

**Landfill development:**

| Area | Fill Period | Development Period |
|------|-------------|-------------------|
| Yerba Buena Cove (Financial District) | 1849-1860s | 1850s-1870s |
| South of Market (east) | 1859-1880s | 1860s-1890s |
| Mission Bay | 1860-1910 | Industrial 1870s+, residential 1990s+ |

### The 1906 Earthquake and Fire

**Destruction zone:** ~4.1 square miles, 514 blocks, bounded approximately by:
- North: Beach Street, Bay Street
- East: Waterfront
- South: Townsend, then Brannan to Mission, Dolores
- West: Van Ness Avenue (used as firebreak)

**Critical rule:** Any building within the 1906 burn zone with an assigned date before 1906 must be reassigned to 1906-1915 (rebuild period).

**Survived areas:**
- Western Addition (west of Van Ness)
- Mission District (south of ~20th Street)
- Noe Valley, Castro
- Potrero Hill
- Russian Hill pocket (Broadway to Vallejo, Taylor to Leavenworth)

### Post-1906 Expansion (1906-1930)

**Rapid development in previously undeveloped areas:**

| Neighborhood | Peak Development | Notes |
|--------------|-----------------|-------|
| Richmond District | 1906-1928 | Refugee settlement, then spec building |
| Sunset District | 1920-1945 | Street car enabled, sand dune clearing |
| Parkside | 1925-1940 | Late streetcar suburb |
| Excelsior | 1910-1930 | Working class expansion |
| Bernal Heights | 1900-1920 | Post-earthquake refuge |

---

## Part 2: Development Zone Model

### Zone Definition Schema

```typescript
interface DevelopmentZone {
  id: string;
  name: string;
  // GeoJSON polygon or MultiPolygon
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;

  // Development timeline
  firstDeveloped: number;      // Year first buildings appeared
  rapidGrowthStart: number;    // Year building boom began
  rapidGrowthEnd: number;      // Year most lots filled
  builtOut: number;            // Year essentially complete

  // 1906 fire impact
  inFireZone: boolean;
  partialFireZone?: boolean;   // Some blocks burned, some survived

  // Terrain factor (affects date distribution)
  terrain: 'flat' | 'moderate_hill' | 'steep_hill' | 'filled_land';

  // Confidence level
  confidence: 'high' | 'medium' | 'low';
}
```

### Proposed Development Zones

```typescript
const DEVELOPMENT_ZONES: DevelopmentZone[] = [
  // === EARLIEST DEVELOPMENT (1835-1870) ===
  {
    id: 'financial-district',
    name: 'Financial District / Downtown',
    firstDeveloped: 1847,
    rapidGrowthStart: 1849,
    rapidGrowthEnd: 1870,
    builtOut: 1890,
    inFireZone: true,
    terrain: 'filled_land',
    confidence: 'high'
  },
  {
    id: 'chinatown',
    name: 'Chinatown',
    firstDeveloped: 1850,
    rapidGrowthStart: 1852,
    rapidGrowthEnd: 1880,
    builtOut: 1900,
    inFireZone: true,
    terrain: 'moderate_hill',
    confidence: 'high'
  },
  {
    id: 'north-beach',
    name: 'North Beach',
    firstDeveloped: 1850,
    rapidGrowthStart: 1860,
    rapidGrowthEnd: 1890,
    builtOut: 1910,
    inFireZone: true,
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'telegraph-hill',
    name: 'Telegraph Hill',
    firstDeveloped: 1850,
    rapidGrowthStart: 1870,
    rapidGrowthEnd: 1900,
    builtOut: 1920,
    inFireZone: true,  // partial - some areas survived
    terrain: 'steep_hill',
    confidence: 'medium'
  },
  {
    id: 'south-beach',
    name: 'South Beach / Rincon Hill',
    firstDeveloped: 1852,
    rapidGrowthStart: 1855,
    rapidGrowthEnd: 1875,
    builtOut: 1890,
    inFireZone: true,
    terrain: 'filled_land',
    confidence: 'medium'
  },
  {
    id: 'soma-east',
    name: 'SoMa East (2nd-4th)',
    firstDeveloped: 1855,
    rapidGrowthStart: 1860,
    rapidGrowthEnd: 1880,
    builtOut: 1900,
    inFireZone: true,
    terrain: 'filled_land',
    confidence: 'medium'
  },

  // === VICTORIAN ERA (1870-1906) ===
  {
    id: 'western-addition',
    name: 'Western Addition / Fillmore',
    firstDeveloped: 1865,
    rapidGrowthStart: 1875,
    rapidGrowthEnd: 1895,
    builtOut: 1905,
    inFireZone: false,  // Survived! West of Van Ness
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'nob-hill',
    name: 'Nob Hill',
    firstDeveloped: 1870,
    rapidGrowthStart: 1878,  // California St Cable Railroad
    rapidGrowthEnd: 1895,
    builtOut: 1906,
    inFireZone: true,
    terrain: 'steep_hill',
    confidence: 'high'
  },
  {
    id: 'russian-hill',
    name: 'Russian Hill',
    firstDeveloped: 1875,
    rapidGrowthStart: 1885,
    rapidGrowthEnd: 1905,
    builtOut: 1920,
    inFireZone: true,  // partial - pocket survived
    terrain: 'steep_hill',
    confidence: 'medium'
  },
  {
    id: 'pacific-heights',
    name: 'Pacific Heights',
    firstDeveloped: 1873,
    rapidGrowthStart: 1885,
    rapidGrowthEnd: 1910,
    builtOut: 1925,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high'
  },
  {
    id: 'hayes-valley',
    name: 'Hayes Valley',
    firstDeveloped: 1870,
    rapidGrowthStart: 1880,
    rapidGrowthEnd: 1900,
    builtOut: 1910,
    inFireZone: true,  // eastern portion
    terrain: 'flat',
    confidence: 'medium'
  },
  {
    id: 'mission-north',
    name: 'Mission District (North of 20th)',
    firstDeveloped: 1860,
    rapidGrowthStart: 1875,
    rapidGrowthEnd: 1900,
    builtOut: 1915,
    inFireZone: true,  // northern tip burned
    terrain: 'flat',
    confidence: 'medium'
  },
  {
    id: 'mission-south',
    name: 'Mission District (South of 20th)',
    firstDeveloped: 1865,
    rapidGrowthStart: 1880,
    rapidGrowthEnd: 1905,
    builtOut: 1920,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'potrero-hill',
    name: 'Potrero Hill',
    firstDeveloped: 1867,
    rapidGrowthStart: 1885,
    rapidGrowthEnd: 1910,
    builtOut: 1930,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium'
  },
  {
    id: 'soma-west',
    name: 'SoMa West (5th-11th)',
    firstDeveloped: 1860,
    rapidGrowthStart: 1870,
    rapidGrowthEnd: 1895,
    builtOut: 1905,
    inFireZone: true,
    terrain: 'flat',
    confidence: 'medium'
  },

  // === CABLE CAR ERA (1889-1910) ===
  {
    id: 'castro',
    name: 'Castro / Eureka Valley',
    firstDeveloped: 1880,
    rapidGrowthStart: 1889,  // Market St Cable to Castro
    rapidGrowthEnd: 1910,
    builtOut: 1925,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high'
  },
  {
    id: 'noe-valley',
    name: 'Noe Valley',
    firstDeveloped: 1885,
    rapidGrowthStart: 1895,
    rapidGrowthEnd: 1915,
    builtOut: 1930,
    inFireZone: false,
    terrain: 'flat',  // Valley floor
    confidence: 'high'
  },
  {
    id: 'glen-park',
    name: 'Glen Park',
    firstDeveloped: 1890,
    rapidGrowthStart: 1905,
    rapidGrowthEnd: 1925,
    builtOut: 1940,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium'
  },
  {
    id: 'bernal-heights',
    name: 'Bernal Heights',
    firstDeveloped: 1880,
    rapidGrowthStart: 1900,
    rapidGrowthEnd: 1920,
    builtOut: 1940,
    inFireZone: false,
    terrain: 'steep_hill',
    confidence: 'medium'
  },
  {
    id: 'haight-ashbury',
    name: 'Haight-Ashbury',
    firstDeveloped: 1880,
    rapidGrowthStart: 1890,
    rapidGrowthEnd: 1905,
    builtOut: 1915,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high'
  },
  {
    id: 'cole-valley',
    name: 'Cole Valley',
    firstDeveloped: 1890,
    rapidGrowthStart: 1900,
    rapidGrowthEnd: 1915,
    builtOut: 1925,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium'
  },

  // === POST-EARTHQUAKE SUBURBS (1906-1930) ===
  {
    id: 'richmond-inner',
    name: 'Inner Richmond',
    firstDeveloped: 1890,
    rapidGrowthStart: 1906,  // Earthquake refugees
    rapidGrowthEnd: 1920,
    builtOut: 1928,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'richmond-outer',
    name: 'Outer Richmond',
    firstDeveloped: 1905,
    rapidGrowthStart: 1915,
    rapidGrowthEnd: 1928,
    builtOut: 1940,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'sunset-inner',
    name: 'Inner Sunset',
    firstDeveloped: 1900,
    rapidGrowthStart: 1910,
    rapidGrowthEnd: 1930,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'sunset-central',
    name: 'Central Sunset',
    firstDeveloped: 1915,
    rapidGrowthStart: 1925,
    rapidGrowthEnd: 1940,
    builtOut: 1950,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'sunset-outer',
    name: 'Outer Sunset',
    firstDeveloped: 1920,
    rapidGrowthStart: 1930,
    rapidGrowthEnd: 1950,
    builtOut: 1960,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'medium'
  },
  {
    id: 'parkside',
    name: 'Parkside',
    firstDeveloped: 1920,
    rapidGrowthStart: 1928,
    rapidGrowthEnd: 1945,
    builtOut: 1955,
    inFireZone: false,
    terrain: 'flat',
    confidence: 'high'
  },
  {
    id: 'excelsior',
    name: 'Excelsior',
    firstDeveloped: 1905,
    rapidGrowthStart: 1915,
    rapidGrowthEnd: 1935,
    builtOut: 1950,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium'
  },
  {
    id: 'visitacion-valley',
    name: 'Visitacion Valley',
    firstDeveloped: 1910,
    rapidGrowthStart: 1925,
    rapidGrowthEnd: 1945,
    builtOut: 1960,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium'
  },
  {
    id: 'bayview',
    name: 'Bayview / Hunters Point',
    firstDeveloped: 1900,
    rapidGrowthStart: 1940,  // WWII shipyards
    rapidGrowthEnd: 1955,
    builtOut: 1970,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'medium'
  },

  // === LATE DEVELOPMENT (1930+) ===
  {
    id: 'west-portal',
    name: 'West Portal',
    firstDeveloped: 1917,  // Twin Peaks Tunnel opened
    rapidGrowthStart: 1925,
    rapidGrowthEnd: 1940,
    builtOut: 1950,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high'
  },
  {
    id: 'forest-hill',
    name: 'Forest Hill',
    firstDeveloped: 1912,
    rapidGrowthStart: 1920,
    rapidGrowthEnd: 1940,
    builtOut: 1955,
    inFireZone: false,
    terrain: 'steep_hill',
    confidence: 'high'
  },
  {
    id: 'st-francis-wood',
    name: 'St. Francis Wood',
    firstDeveloped: 1912,
    rapidGrowthStart: 1915,
    rapidGrowthEnd: 1935,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high'
  },
  {
    id: 'marina',
    name: 'Marina District',
    firstDeveloped: 1915,  // Built on 1915 Expo fill
    rapidGrowthStart: 1920,
    rapidGrowthEnd: 1935,
    builtOut: 1945,
    inFireZone: false,
    terrain: 'filled_land',
    confidence: 'high'
  },
  {
    id: 'sea-cliff',
    name: 'Sea Cliff',
    firstDeveloped: 1913,
    rapidGrowthStart: 1920,
    rapidGrowthEnd: 1940,
    builtOut: 1950,
    inFireZone: false,
    terrain: 'moderate_hill',
    confidence: 'high'
  },
  {
    id: 'diamond-heights',
    name: 'Diamond Heights',
    firstDeveloped: 1960,
    rapidGrowthStart: 1962,
    rapidGrowthEnd: 1975,
    builtOut: 1985,
    inFireZone: false,
    terrain: 'steep_hill',
    confidence: 'high'
  },

  // === SPECIAL ZONES ===
  {
    id: 'mission-bay',
    name: 'Mission Bay',
    firstDeveloped: 1870,  // Industrial only
    rapidGrowthStart: 2000,  // Modern residential
    rapidGrowthEnd: 2020,
    builtOut: 2030,
    inFireZone: false,  // Industrial area during fire
    terrain: 'filled_land',
    confidence: 'high'
  },
  {
    id: 'treasure-island',
    name: 'Treasure Island',
    firstDeveloped: 1939,  // Created for 1939 Expo
    rapidGrowthStart: 2015,
    rapidGrowthEnd: 2035,
    builtOut: 2040,
    inFireZone: false,
    terrain: 'filled_land',
    confidence: 'high'
  }
];
```

---

## Part 3: 1906 Fire Zone Boundary

### GeoJSON Boundary Source

DataSF provides the official GIS boundary: [Areas Damaged by Fire Following 1906 Earthquake](https://data.sfgov.org/-/Areas-Damaged-by-Fire-Following-1906-Earthquake/yk2r-b4e8)

**Download via API:**
```bash
# GeoJSON format
curl "https://data.sfgov.org/api/geospatial/ff3a-iqhv?method=export&format=GeoJSON" \
  -o data/raw/sf-urban/fire-1906-boundary.geojson
```

### Approximate Boundary (for fallback)

If GIS data unavailable, use these approximate street boundaries:

**Northern boundary:** Beach St → Taylor St → Bay St → Jones St → Francisco St → Van Ness Ave
**Western boundary:** Van Ness Ave (south to Market)
**Southern boundary:** Market St → Dolores → 20th St → Mission → Capp → Howard → Brannan → Townsend
**Eastern boundary:** Waterfront

### Fire Zone Rules

```typescript
function applyFireZoneRules(
  building: Building,
  isInFireZone: boolean,
  originalYear: number
): number {
  if (!isInFireZone) {
    return originalYear;
  }

  // Building in fire zone with pre-1906 date must be rebuilt
  if (originalYear < 1906) {
    // Most rebuilding happened 1906-1915
    // Use weighted distribution favoring early rebuild
    return generateRebuildYear(1906, 1920, 'front_weighted');
  }

  return originalYear;
}

function generateRebuildYear(
  start: number,
  end: number,
  distribution: 'uniform' | 'front_weighted'
): number {
  if (distribution === 'front_weighted') {
    // 60% rebuilt 1906-1910, 30% 1910-1915, 10% 1915-1920
    const r = Math.random();
    if (r < 0.6) return randomInt(1906, 1910);
    if (r < 0.9) return randomInt(1910, 1915);
    return randomInt(1915, 1920);
  }
  return randomInt(start, end);
}
```

---

## Part 4: Synthetic Date Generation Algorithm

### Algorithm Overview

```
For each building without a known construction date:
  1. Determine which development zone contains the building
  2. Check if building is in 1906 fire zone
  3. Calculate base year from zone's development curve
  4. Apply distance modifiers from historical centers
  5. Apply terrain penalties
  6. Apply fire zone rebuild rules if necessary
  7. Add small random jitter for visual variety
```

### Implementation

```typescript
interface SyntheticDateParams {
  lng: number;
  lat: number;
  neighborhood: string;  // From SF OpenData
  parcelNumber?: string;
}

interface HistoricalCenter {
  name: string;
  lng: number;
  lat: number;
  foundedYear: number;
  influenceRadiusKm: number;
}

const HISTORICAL_CENTERS: HistoricalCenter[] = [
  {
    name: 'Portsmouth Square',
    lng: -122.4050,
    lat: 37.7952,
    foundedYear: 1835,
    influenceRadiusKm: 2.0
  },
  {
    name: 'Mission Dolores',
    lng: -122.4270,
    lat: 37.7600,
    foundedYear: 1776,
    influenceRadiusKm: 1.5
  },
  {
    name: 'Market & Powell',
    lng: -122.4078,
    lat: 37.7848,
    foundedYear: 1860,
    influenceRadiusKm: 2.5
  }
];

function generateSyntheticYear(params: SyntheticDateParams): {
  year: number;
  confidence: 'high' | 'medium' | 'low';
  method: string;
} {
  const { lng, lat, neighborhood } = params;

  // Step 1: Find development zone
  const zone = findDevelopmentZone(lng, lat, neighborhood);
  if (!zone) {
    // Fallback: use neighborhood median (existing behavior)
    return {
      year: getNeighborhoodMedian(neighborhood),
      confidence: 'low',
      method: 'neighborhood_median_fallback'
    };
  }

  // Step 2: Check fire zone
  const inFireZone = isInFireZone(lng, lat);

  // Step 3: Generate base year from zone's development curve
  let baseYear = sampleDevelopmentCurve(zone);

  // Step 4: Apply distance modifier from historical centers
  const distanceModifier = calculateDistanceModifier(lng, lat);
  baseYear += distanceModifier;

  // Step 5: Apply terrain penalty (hills developed later)
  if (zone.terrain === 'steep_hill') {
    baseYear += randomInt(3, 8);
  } else if (zone.terrain === 'moderate_hill') {
    baseYear += randomInt(1, 4);
  }

  // Step 6: Apply fire zone rules
  if (inFireZone && baseYear < 1906) {
    baseYear = generateRebuildYear(1906, 1920, 'front_weighted');
  }

  // Step 7: Add jitter for visual variety
  baseYear += randomInt(-2, 2);

  // Clamp to zone bounds
  baseYear = Math.max(zone.firstDeveloped, Math.min(zone.builtOut, baseYear));

  return {
    year: Math.round(baseYear),
    confidence: zone.confidence,
    method: `zone_${zone.id}${inFireZone ? '_fire_rebuild' : ''}`
  };
}

/**
 * Sample from development curve using beta distribution
 * Most buildings built during rapid growth period
 */
function sampleDevelopmentCurve(zone: DevelopmentZone): number {
  const { firstDeveloped, rapidGrowthStart, rapidGrowthEnd, builtOut } = zone;

  // Use beta distribution: alpha=2, beta=3 gives front-weighted curve
  // Most development happens in first 60% of timeline
  const beta = sampleBeta(2, 3);

  // Map to development timeline
  // 10% before rapid growth, 70% during rapid growth, 20% after
  if (beta < 0.1) {
    // Early development
    return firstDeveloped + (rapidGrowthStart - firstDeveloped) * (beta / 0.1);
  } else if (beta < 0.8) {
    // Rapid growth period (most buildings)
    return rapidGrowthStart + (rapidGrowthEnd - rapidGrowthStart) * ((beta - 0.1) / 0.7);
  } else {
    // Late development
    return rapidGrowthEnd + (builtOut - rapidGrowthEnd) * ((beta - 0.8) / 0.2);
  }
}

/**
 * Buildings closer to historical centers developed earlier
 */
function calculateDistanceModifier(lng: number, lat: number): number {
  let minModifier = 0;

  for (const center of HISTORICAL_CENTERS) {
    const distKm = haversineDistance(lng, lat, center.lng, center.lat);

    if (distKm < center.influenceRadiusKm) {
      // Within influence radius: earlier development
      // -5 to 0 years based on proximity
      const proximity = 1 - (distKm / center.influenceRadiusKm);
      const modifier = -5 * proximity;
      minModifier = Math.min(minModifier, modifier);
    }
  }

  return minModifier;
}

// Utility functions
function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function sampleBeta(alpha: number, beta: number): number {
  // Box-Muller approximation for beta distribution
  // For alpha=2, beta=3, mean ~0.4, mode ~0.25
  const u1 = Math.random();
  const u2 = Math.random();
  const x = Math.pow(u1, 1/alpha);
  const y = Math.pow(u2, 1/beta);
  return x / (x + y);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() + min + Math.random() * (max - min));
}
```

---

## Part 5: Integration with Existing Pipeline

### Modified Pipeline Flow

```typescript
// In sf-urban.ts, modify the year assignment logic:

async function main() {
  // ... existing batch loading code ...

  // Load development zones and fire boundary
  const developmentZones = loadDevelopmentZones();
  const fireBoundary = await loadFireBoundary();

  // First pass: collect known years for validation
  // ... existing code ...

  // Second pass: process parcels with enhanced date generation
  for (const parcel of allParcels) {
    const rawYear = parseInt(parcel.year_property_built, 10);
    const hasKnownYear = !isNaN(rawYear) && rawYear >= 1800 && rawYear <= 2025;

    let year: number;
    let estimated: boolean;
    let estimationMethod: string | undefined;

    if (hasKnownYear) {
      year = rawYear;
      estimated = false;

      // Still apply fire zone validation to known years
      const inFireZone = isPointInPolygon(
        [lng, lat],
        fireBoundary
      );
      if (inFireZone && year < 1906) {
        // Flag suspicious pre-1906 dates in fire zone
        console.warn(`Suspicious date ${year} for ${parcel.parcel_number} in fire zone`);
      }
    } else {
      // Generate synthetic date
      const synthetic = generateSyntheticYear({
        lng: parcel.the_geom.coordinates[0],
        lat: parcel.the_geom.coordinates[1],
        neighborhood: parcel.analysis_neighborhood,
        parcelNumber: parcel.parcel_number
      });
      year = synthetic.year;
      estimated = true;
      estimationMethod = synthetic.method;
    }

    // ... rest of processing ...
  }
}
```

### New Properties to Add

```typescript
interface BuildingProperties {
  // Existing
  year: number;
  estimated: boolean;
  use: string;
  // ...

  // New synthetic date metadata
  estimationMethod?: string;      // e.g., 'zone_western-addition', 'fire_rebuild'
  estimationConfidence?: string;  // 'high' | 'medium' | 'low'
  inFireZone?: boolean;           // For visualization/filtering
  developmentZone?: string;       // Zone ID for debugging
}
```

---

## Part 6: Data Sources for Zone Boundaries

### Primary Sources

1. **SF Planning Department Analysis Neighborhoods**
   - Already in your data as `analysis_neighborhood`
   - Good starting point but too coarse for development zones

2. **DataSF GIS Layers**
   - [Zoning Districts](https://data.sfgov.org/Geographic-Locations-and-Boundaries/Zoning-Districts/8br2-hhp3)
   - [Supervisor Districts (historical)](https://data.sfgov.org/Geographic-Locations-and-Boundaries/Current-Supervisor-Districts/8nkz-x4ny)

3. **1906 Fire Boundary**
   - [DataSF: Areas Damaged by Fire](https://data.sfgov.org/-/Areas-Damaged-by-Fire-Following-1906-Earthquake/yk2r-b4e8)

4. **Historical Sanborn Maps**
   - [Library of Congress 1886-1899](https://www.loc.gov/collections/sanborn-maps/?fa=location:san+francisco)
   - [SF Public Library Digital Collections](https://sfpl.org/locations/main-library/sf-history-center)
   - [David Rumsey Collection (1905)](https://www.davidrumsey.com)

### Recommended Workflow

1. **Start simple**: Use the existing `analysis_neighborhood` field to map to development zones
2. **Add fire boundary**: Download and integrate the 1906 fire GeoJSON
3. **Refine zones**: Create custom GeoJSON polygons for sub-neighborhood precision
4. **Validate**: Compare synthetic dates against known dates in the dataset

---

## Part 7: Validation Strategy

### Sanity Checks

```typescript
function validateSyntheticDates(buildings: Building[]) {
  const issues: string[] = [];

  for (const b of buildings) {
    // 1. No buildings before area was accessible
    if (b.year < 1835 && b.developmentZone !== 'mission-dolores-area') {
      issues.push(`${b.parcelNumber}: ${b.year} too early for ${b.developmentZone}`);
    }

    // 2. Fire zone buildings shouldn't have pre-1906 dates
    if (b.inFireZone && b.year < 1906 && !b.estimated) {
      issues.push(`${b.parcelNumber}: known date ${b.year} in fire zone - verify`);
    }

    // 3. Sunset/Richmond shouldn't have pre-1890 dates
    if (['sunset', 'richmond'].some(z => b.developmentZone?.includes(z))) {
      if (b.year < 1890) {
        issues.push(`${b.parcelNumber}: ${b.year} too early for ${b.developmentZone}`);
      }
    }

    // 4. Marina can't predate 1915 (built on exposition fill)
    if (b.developmentZone === 'marina' && b.year < 1915) {
      issues.push(`${b.parcelNumber}: Marina building dated ${b.year} < 1915 fill date`);
    }
  }

  return issues;
}
```

### Visual Validation

Create a comparison view showing:
- Buildings with known dates (solid color)
- Buildings with synthetic dates (hatched/translucent)
- 1906 fire boundary overlay
- Development zone boundaries

---

## Part 8: Implementation Phases

### Phase 1: Fire Zone Integration (Recommended First)
- Download 1906 fire boundary GeoJSON
- Add `inFireZone` property to all buildings
- Apply rebuild year logic to estimated dates in fire zone
- Visual validation with fire boundary overlay

### Phase 2: Basic Zone-Based Estimation
- Map `analysis_neighborhood` to development zones
- Implement `sampleDevelopmentCurve()` with zone timelines
- Replace neighborhood median fallback with zone-based estimation

### Phase 3: Spatial Refinement
- Create custom zone boundary polygons
- Add distance-from-center modifiers
- Add terrain-based modifiers

### Phase 4: Historical Validation
- Cross-reference with Sanborn maps for pre-1906 areas
- Validate against known historical photos/records
- Adjust zone parameters based on validation

---

## References

### Historical Sources
- [FoundSF - SF Historical Encyclopedia](https://www.foundsf.org)
- [Western Neighborhoods Project](https://www.outsidelands.org)
- [SF Planning - Historic Context Statements](https://sfplanning.org)
- [SF Heritage](http://www.sfheritage.org)

### GIS Data
- [DataSF Open Data Portal](https://data.sfgov.org)
- [1906 Fire Boundary](https://data.sfgov.org/-/Areas-Damaged-by-Fire-Following-1906-Earthquake/yk2r-b4e8)

### Maps
- [Library of Congress Sanborn Maps](https://www.loc.gov/collections/sanborn-maps/)
- [David Rumsey Map Collection](https://www.davidrumsey.com)
- [SF Public Library Historical Maps](https://sfpl.org)
