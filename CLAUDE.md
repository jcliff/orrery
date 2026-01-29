# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orrery is a timelapse visualization platform. It consists of two reusable libraries and multiple proving-ground applications:

- **Fieldline** (`fieldline/`): Data acquisition and normalization layer
- **Chrona** (`chrona/`): Rendering and animation engine using MapLibre GL JS
- **Hurricanes** (`projects/hurricanes/`): Atlantic hurricane tracks (1851–present)
- **Railroads** (`projects/railroads/`): US railroad network expansion
- **SF Urban** (`projects/sf-urban/`): San Francisco building development (1848–present)

## Development Commands

```bash
# Install all workspace dependencies
pnpm install

# Run from root - commands propagate to workspaces
pnpm build
pnpm test
pnpm lint

# Run the apps
pnpm --filter hurricanes dev
pnpm --filter sf-urban dev

# Build a specific package
pnpm --filter fieldline build
pnpm --filter chrona build
```

## Architecture

### Data Flow

```
HURDAT2 (NOAA) → Fieldline (parse/normalize) → GeoJSON/JSON → Chrona (render) → MapLibre GL
```

### Fieldline Data Pipeline

1. Fetch HURDAT2 fixed-width text from NOAA
2. Parse into `Storm` and `TrackPoint` objects
3. Normalize timestamps (ISO 8601) and units (knots, mb)
4. Export to `storms.json`, `tracks.geojson`, `points.geojson`

Key types:
- `Storm`: id, name, basin, year, track points, peak intensity, landfalls, category
- `TrackPoint`: timestamp, lat/lon, wind, pressure, status (TD/TS/HU/EX/etc.)
- `StormStatus`: TD, TS, HU, EX, SD, SS, LO, WV, DB

### Chrona Rendering Engine

Core abstractions:
- **Timeline**: Master clock controlling playback (play/pause/seek/speed)
- **Interpolator**: Temporal interpolation between track points
- **Renderer**: MapLibre GL-based visualization with multiple modes

Rendering modes: cumulative tracks, active storms only, single storm, heatmap, yearly summary

### SF Urban Architecture

The SF Urban project visualizes 212k buildings with smooth 60fps animation using a two-tier approach:

**Zoomed out (< zoom 15):** Aggregated GeoJSON clusters
- Buildings grouped by city block + grid cell (respects street boundaries)
- ~34k cluster points with centroid positioning
- JavaScript filtering via `filterByTime()`

**Zoomed in (>= zoom 15):** PMTiles vector tiles
- All 212k buildings as individual points
- GPU-evaluated filters via `map.setFilter()` — no JS loop
- Temporal expressions in `chrona/src/core/temporal-expression.ts`

**Tile generation:**
```bash
pnpm --filter fieldline pipeline:sf-urban        # Generate GeoJSON
pnpm --filter fieldline pipeline:sf-urban-tiles  # Generate PMTiles (requires tippecanoe)
```

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
- **UI**: React + Tailwind CSS
- **Build**: Vite
- **Data format**: GeoJSON for tracks, JSON for metadata

## Key Design Decisions

- Atlantic basin only for v1 (East Pacific excluded)
- 6-hourly discrete time steps from HURDAT2 (no interpolation initially)
- Dark basemap for visual contrast
- GeoJSON as the interchange format for geospatial data

## Reference

Read `architecture.md` for complete design specifications including schemas, pipeline details, and milestone plans.
