# Orrery: Architecture Plan

## Project: Atlantic Hurricane Tracks (1851–Present)

---

## Vision

A timelapse visualization platform where **Fieldline** handles data acquisition and normalization, and **Chrona** handles rendering and artistic presentation. The hurricane project is the proving ground.

---

## Data Source

**HURDAT2** (Hurricane Database 2)  
- Maintained by NOAA's National Hurricane Center  
- URL: https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2023-051124.txt  
- Coverage: Atlantic basin, 1851–present  
- Format: Fixed-width text, oddly formatted but well-documented  
- Updated annually

**What's in it:**
- Storm ID, name (post-1950), dates
- 6-hourly positions (lat/lon)
- Maximum sustained wind (knots)
- Minimum pressure (mb)
- Status (tropical depression, tropical storm, hurricane, extratropical, etc.)
- Landfall indicators

---

## Repository Structure

```
orrery/
├── README.md
├── package.json                 # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml
│
├── fieldline/                   # Data layer
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── sources/             # Data source adapters
│   │   │   └── hurdat2.ts       # HURDAT2 parser
│   │   ├── schemas/             # Normalized data types
│   │   │   ├── storm.ts
│   │   │   └── track-point.ts
│   │   ├── pipelines/           # ETL orchestration
│   │   │   └── hurricanes.ts
│   │   └── utils/
│   │       └── temporal.ts      # Time normalization helpers
│   ├── data/
│   │   ├── raw/                 # Original downloaded files
│   │   └── processed/           # Cleaned JSON/GeoJSON
│   └── tests/
│
├── chrona/                      # Rendering layer
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── core/
│   │   │   ├── timeline.ts      # Playback engine
│   │   │   ├── interpolator.ts  # Temporal interpolation
│   │   │   └── easing.ts        # Animation curves
│   │   ├── renderers/
│   │   │   ├── maplibre/        # Map-based renderer
│   │   │   │   ├── index.ts
│   │   │   │   ├── layers/
│   │   │   │   │   ├── track-line.ts
│   │   │   │   │   ├── track-point.ts
│   │   │   │   │   └── heatmap.ts
│   │   │   │   └── styles/
│   │   │   │       └── hurricane.ts
│   │   │   └── canvas/          # Future: pure canvas renderer
│   │   ├── controls/
│   │   │   ├── playback.ts      # Play/pause/scrub
│   │   │   └── filters.ts       # Year, intensity, etc.
│   │   └── palettes/
│   │       └── saffir-simpson.ts  # Color by intensity
│   └── tests/
│
├── projects/                    # Specific visualizations
│   └── hurricanes/
│       ├── package.json
│       ├── src/
│       │   ├── App.tsx
│       │   ├── config.ts        # Bounds, time range, defaults
│       │   └── components/
│       │       ├── Map.tsx
│       │       ├── Timeline.tsx
│       │       └── StormInfo.tsx
│       ├── public/
│       └── index.html
│
└── docs/
    ├── fieldline.md
    ├── chrona.md
    └── data-formats.md
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Monorepo | pnpm workspaces | Fast, disk-efficient, good TS support |
| Language | TypeScript | Type safety for data schemas, good DX |
| Fieldline runtime | Node.js | File I/O, fetching, processing |
| Chrona renderer | MapLibre GL JS | Open source, performant, beautiful |
| UI framework | React | Widely known, good MapLibre bindings |
| Build | Vite | Fast, simple, good for both lib and app |
| Styling | Tailwind | Fast iteration, stays out of the way |
| Data format | GeoJSON + custom JSON | GeoJSON for tracks, JSON for metadata |

---

## Fieldline: Data Pipeline

### Schema: Storm

```typescript
interface Storm {
  id: string;              // e.g., "AL092019" (Atlantic, 9th storm, 2019)
  name: string | null;     // "DORIAN" or null for unnamed
  basin: "AL" | "EP";      // Atlantic or East Pacific
  year: number;
  track: TrackPoint[];
  maxWind: number;         // Peak intensity (knots)
  minPressure: number;     // Lowest pressure (mb)
  landfalls: Landfall[];
  category: number;        // Peak Saffir-Simpson (0-5)
}

interface TrackPoint {
  timestamp: string;       // ISO 8601
  lat: number;
  lon: number;
  wind: number;            // knots
  pressure: number | null; // mb
  status: StormStatus;
}

type StormStatus = 
  | "TD"   // Tropical Depression
  | "TS"   // Tropical Storm  
  | "HU"   // Hurricane
  | "EX"   // Extratropical
  | "SD"   // Subtropical Depression
  | "SS"   // Subtropical Storm
  | "LO"   // Low
  | "WV"   // Tropical Wave
  | "DB";  // Disturbance

interface Landfall {
  timestamp: string;
  lat: number;
  lon: number;
  wind: number;
  location: string;        // e.g., "Florida Keys"
}
```

### Pipeline Steps

1. **Fetch**: Download HURDAT2 from NOAA (cache locally)
2. **Parse**: Convert fixed-width format to structured objects
3. **Normalize**: ISO timestamps, consistent units, fill gaps
4. **Enrich**: Calculate derived fields (category, peak intensity)
5. **Export**: 
   - `storms.json` — metadata array
   - `tracks.geojson` — LineString features with properties
   - `points.geojson` — Point features (for animation)

### Output Files

```
fieldline/data/processed/hurricanes/
├── storms.json           # Array of Storm objects (no geometry)
├── tracks.geojson        # LineStrings, one per storm
├── points.geojson        # All track points, all storms
└── by-year/
    ├── 1851.geojson
    ├── 1852.geojson
    └── ...
```

---

## Chrona: Rendering Engine

### Core Concepts

**Timeline**: The master clock. Knows the current "display time" and controls playback.

```typescript
interface Timeline {
  start: Date;
  end: Date;
  current: Date;
  speed: number;           // e.g., 1 day per second
  playing: boolean;
  
  play(): void;
  pause(): void;
  seek(date: Date): void;
  setSpeed(speed: number): void;
  
  onTick(callback: (current: Date) => void): void;
}
```

**Interpolator**: Given track points and a timestamp, returns the interpolated position/properties.

```typescript
function interpolate(
  track: TrackPoint[],
  timestamp: Date,
  easing?: EasingFunction
): InterpolatedPoint | null;
```

**Renderer**: Takes a timeline and data, draws frames.

### Rendering Modes

1. **Cumulative tracks**: All paths up to current time (ghost trails)
2. **Active storms**: Only storms that exist at current time
3. **Single storm**: Follow one storm, cinematic
4. **Heatmap**: Density of all tracks (no time dimension)
5. **Yearly summary**: One year at a time, then fade

### Visual Encoding

| Property | Visual |
|----------|--------|
| Storm track | Line path |
| Current position | Animated dot/pulse |
| Intensity (wind) | Color (blue → yellow → red) |
| Intensity (wind) | Line thickness |
| Status (HU vs TS) | Dash pattern or glow |
| Storm name | Label on hover |

### Saffir-Simpson Palette

```typescript
const palette = {
  TD: "#6ec4e8",    // Tropical Depression — light blue
  TS: "#4daf4a",    // Tropical Storm — green
  1:  "#ffe066",    // Category 1 — yellow
  2:  "#ffb347",    // Category 2 — orange
  3:  "#ff6b6b",    // Category 3 — red-orange
  4:  "#d63031",    // Category 4 — red
  5:  "#6c3483",    // Category 5 — purple
};
```

---

## Milestones

### M1: Static Map (Day 1)
- [ ] Repo scaffolding (pnpm workspaces, TS config)
- [ ] Fieldline: Fetch and parse HURDAT2
- [ ] Fieldline: Export tracks.geojson
- [ ] Chrona: MapLibre setup
- [ ] Chrona: Render all tracks as static lines, colored by intensity
- [ ] **Deliverable**: A beautiful static image of 170 years of hurricanes

### M2: Time Controls (Day 2)
- [ ] Chrona: Timeline class
- [ ] Chrona: Filter tracks by current time
- [ ] UI: Play/pause button, year display
- [ ] UI: Scrubber/slider
- [ ] **Deliverable**: Animated playback of hurricane tracks over time

### M3: Polish (Day 3)
- [ ] Chrona: Animated current-position dots
- [ ] Chrona: Trail fade (older = more transparent)
- [ ] UI: Speed controls
- [ ] UI: Hover for storm info
- [ ] UI: Filter by year range, intensity
- [ ] **Deliverable**: Something you'd actually want to watch

### M4: Art Modes (Future)
- [ ] Cumulative view (all tracks persist, build up over time)
- [ ] Single-storm cinematic mode
- [ ] Export to video
- [ ] Custom color palettes
- [ ] Generative/abstract rendering modes

---

## Open Questions

1. **Basemap style**: Dark (tracks pop) or light (geographic context)? Probably dark.

2. **Time resolution**: HURDAT2 is 6-hourly. Interpolate to smooth animation, or keep discrete steps? Discrete for now

3. **Historical vs. modern**: Pre-satellite era (before ~1966) has worse data. Show confidence somehow? Nah

4. **Projection**: Web Mercator (easy) or something more aesthetic for Atlantic (conic)? Not sure

5. **Scope creep**: East Pacific storms are in a separate file. Include, or Atlantic only for v1? yes, Atlantic only v1


