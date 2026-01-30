# CLAUDE.md

Dev context for Claude Code.

## Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Run chrona app (http://localhost:5173)
pnpm build                # Build all packages

# Pipelines (run from root)
pnpm --filter fieldline pipeline:railroads
pnpm --filter fieldline pipeline:hurricanes
pnpm --filter fieldline pipeline:sf-urban

# Bay Area parcel pipelines (each city has 3 scripts: fetch, process, tiles)
pnpm --filter fieldline pipeline:palo-alto-fetch
pnpm --filter fieldline pipeline:palo-alto
pnpm --filter fieldline pipeline:palo-alto-tiles
# Similar pattern for: campbell, solano, livermore, santa-clara, hayward,
# sonoma, santa-rosa, pittsburg, walnut-creek, brentwood, berkeley
```

## Structure

- `fieldline/` — Data acquisition & ETL. Pipelines in `src/pipelines/`, parsers in `src/sources/`
- `chrona/` — Rendering app. Visualization configs in `src/visualizations/`, components in `src/components/`

Data flow: Raw source → Fieldline → GeoJSON/PMTiles in `chrona/public/data/` → MapLibre GL

## Key Files

- `chrona/src/visualizations/types.ts` — VisualizationConfig interface
- `chrona/src/components/VisualizationView.tsx` — Main map + timeline component
- `chrona/src/core/temporal-expression.ts` — GPU filter expressions for PMTiles
- `fieldline/src/data/sf-development-zones.ts` — Historical zone definitions for synthetic dates
- `fieldline/src/data/sf-synthetic-dates.ts` — Synthetic date generation algorithm

## SF Urban Two-Tier Rendering

- **Zoom < 15:** Aggregated GeoJSON clusters (~34k points), JS filtering
- **Zoom >= 15:** PMTiles vector tiles (212k buildings), GPU-evaluated filters

## Color Palettes

**Land Use (SF Urban):**
- Single Family: `#3498db`, Multi-Family: `#9b59b6`, Retail: `#e74c3c`
- Office: `#e67e22`, Hotel: `#f39c12`, Industrial: `#7f8c8d`
- Government: `#27ae60`, Mixed Use: `#1abc9c`

**Saffir-Simpson (Hurricanes):**
- TD: `#6ec4e8`, TS: `#4daf4a`, Cat 1: `#ffe066`, Cat 2: `#ffb347`
- Cat 3: `#ff6b6b`, Cat 4: `#d63031`, Cat 5: `#6c3483`

## Bay Area Data Sources

**Working sources with year built data:**
- SF Urban (Socrata), Palo Alto, Campbell, Solano County, Livermore
- Santa Clara, Hayward, Sonoma County, Santa Rosa
- Pittsburg, Walnut Creek, Brentwood (Contra Costa County)
- Berkeley (MapServer - requires JSON format + UTM reprojection)

**Dead ends (no public year built data):**
- San Mateo County / cities (Redwood City, Daly City, etc.)
- Alameda County parcel layer (has boundaries only, no year built)
- Oakland, Fremont (no accessible endpoints)
- Marin County (parcels lack year built field)
- Napa County (parcels lack year built field)
- Concord, Antioch, Pleasant Hill (no public year built data)
- Sunnyvale, Mountain View, Cupertino (no parcel services found)
- San Jose (endpoint exists but year built field not confirmed)

**MapServer quirks:**
- Some MapServers don't support `f=geojson` with geometry at scale
- Use `f=json` and convert ESRI JSON to GeoJSON manually
- Check `spatialReference.wkid` for coordinate system (may need proj4 reprojection)
