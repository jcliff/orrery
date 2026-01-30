# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orrery is a timelapse visualization platform with two packages:

- **Fieldline** (`fieldline/`): Data acquisition and normalization layer
- **Chrona** (`chrona/`): Unified visualization app + rendering engine library using MapLibre GL JS

The Chrona app hosts four visualizations accessible via dropdown navigation:
- Atlantic Hurricane Tracks (1851–present)
- US Railroad Network Expansion
- San Francisco Building Development (1848–2022)
- Palo Alto Urban Development (1880–present)

## Development Commands

```bash
# Install all workspace dependencies
pnpm install

# Run the unified Chrona app
pnpm dev

# Build all packages
pnpm build

# Build only the Chrona library (for external consumption)
pnpm --filter chrona build:lib

# Run data pipelines
pnpm pipeline:hurricanes
pnpm pipeline:railroads
pnpm pipeline:sf-urban
pnpm pipeline:sf-urban-tiles  # Requires tippecanoe
pnpm pipeline:palo-alto
pnpm pipeline:palo-alto-tiles # Requires tippecanoe
```

## Architecture

### Unified App Structure

```
chrona/
├── src/
│   ├── index.ts              # Library exports (Timeline, filterByTime, etc.)
│   ├── main.tsx              # App entry point
│   ├── App.tsx               # Root with header + hash routing
│   ├── core/                 # Library core (unchanged)
│   │   ├── timeline.ts
│   │   ├── temporal-filter.ts
│   │   └── temporal-expression.ts
│   ├── visualizations/       # Per-visualization configs
│   │   ├── types.ts          # VisualizationConfig interface
│   │   ├── registry.ts       # Map of all visualizations
│   │   ├── hurricanes.ts
│   │   ├── railroads.ts
│   │   ├── sf-urban.ts
│   │   └── palo-alto.ts
│   ├── components/           # Shared UI components
│   │   ├── Header.tsx
│   │   ├── VisualizationView.tsx
│   │   ├── TimelineControls.tsx
│   │   ├── Legend.tsx
│   │   └── Title.tsx
│   └── hooks/
│       ├── useTimeline.ts
│       └── useTemporalData.ts
├── public/
│   └── data/                 # All visualization data
│       ├── hurricanes/
│       ├── railroads/
│       ├── sf-urban/
│       └── palo-alto/
└── index.html
```

### Data Flow

```
Raw Data (NOAA, Shapefiles, etc.) → Fieldline (parse/normalize) → GeoJSON/PMTiles → Chrona (render) → MapLibre GL
```

### Fieldline Data Pipeline

Pipelines output directly to `chrona/public/data/{visualization}/`:

Key types:
- `Storm`: id, name, basin, year, track points, peak intensity, landfalls, category
- `TrackPoint`: timestamp, lat/lon, wind, pressure, status (TD/TS/HU/EX/etc.)
- `StormStatus`: TD, TS, HU, EX, SD, SS, LO, WV, DB

### Chrona Rendering Engine

Core library exports (in `chrona/src/index.ts`):
- **Timeline**: Master clock controlling playback (play/pause/seek/speed)
- **filterByTime**: JavaScript temporal filtering for GeoJSON
- **createTemporalFilter**: GPU-evaluated MapLibre filter expressions
- **createOpacityExpression**: Age-based opacity for fading effects

### Two-Tier Rendering (SF Urban, Palo Alto)

Large datasets use zoom-based LOD switching:

**Zoomed out (< zoom 15):** Aggregated GeoJSON clusters
- Buildings grouped by city block + grid cell
- JavaScript filtering via `filterByTime()`

**Zoomed in (>= zoom 15):** PMTiles vector tiles
- Full dataset as individual points/polygons
- GPU-evaluated filters via `map.setFilter()` — 60fps performance
- Temporal expressions in `chrona/src/core/temporal-expression.ts`

### Hash-Based Routing

The app uses simple hash-based routing (no React Router needed):
- `/#/hurricanes` - Atlantic Hurricane Tracks
- `/#/railroads` - US Railroad Development
- `/#/sf-urban` - San Francisco Urban Development
- `/#/palo-alto` - Palo Alto Urban Development

### TimelineControls Variants

The unified TimelineControls component supports two layouts:
- **full**: Centered floating panel with year range sliders (hurricanes, railroads)
- **compact**: Bottom bar layout (sf-urban, palo-alto)

### Saffir-Simpson Color Palette

| Category | Color |
|----------|-------|
| TD | `#6ec4e8` (light blue) |
| TS | `#4daf4a` (green) |
| Cat 1 | `#ffe066` (yellow) |
| Cat 2 | `#ffb347` (orange) |
| Cat 3 | `#ff6b6b` (red-orange) |
| Cat 4 | `#d63031` (red) |
| Cat 5 | `#6c3483` (purple) |

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Language**: TypeScript
- **Rendering**: MapLibre GL JS
- **UI**: React
- **Build**: Vite
- **Data format**: GeoJSON, PMTiles

## Key Design Decisions

- Unified app with dropdown navigation (single deployable)
- Hash-based routing for simplicity
- Config-driven visualizations for consistency
- Two-tier rendering for large datasets
- Dark basemap for visual contrast
- GeoJSON as the interchange format

## Reference

Read `architecture.md` for complete design specifications including schemas, pipeline details, and milestone plans.
