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

# Northern Nevada parcel pipelines
# Washoe & Lyon have year built in GIS data (direct fetch)
pnpm --filter fieldline pipeline:washoe-fetch
pnpm --filter fieldline pipeline:washoe
pnpm --filter fieldline pipeline:washoe-tiles
pnpm --filter fieldline pipeline:lyon-fetch
pnpm --filter fieldline pipeline:lyon
pnpm --filter fieldline pipeline:lyon-tiles

# Carson City, Douglas, Storey (scrape assessor → geocode → process)
# Step 1: Scrape assessor data
pnpm --filter fieldline scrape:carson-assessor
pnpm --filter fieldline scrape:douglas-assessor
pnpm --filter fieldline scrape:storey-assessor
# Step 2: Geocode addresses to create point geometry
pnpm --filter fieldline geocode:carson-assessor
pnpm --filter fieldline geocode:douglas-assessor
pnpm --filter fieldline geocode:storey-assessor
# Step 3: Process and generate tiles
pnpm --filter fieldline pipeline:carson-city
pnpm --filter fieldline pipeline:carson-city-tiles
pnpm --filter fieldline pipeline:douglas
pnpm --filter fieldline pipeline:douglas-tiles
pnpm --filter fieldline pipeline:storey
pnpm --filter fieldline pipeline:storey-tiles
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

**Working sources with year built (13 areas, 770k+ parcels):**
- SF Urban (Socrata): ~212k buildings
- Palo Alto, Campbell, Solano County, Livermore: ~252k parcels
- Santa Clara, Hayward, Sonoma County, Santa Rosa: ~383k parcels
- Pittsburg, Walnut Creek, Brentwood (Contra Costa): ~80k parcels
- Berkeley (MapServer): ~27k parcels, requires f=json + proj4 reprojection

**GIS exists but NO year built field:**
- San Jose: `geo.sanjoseca.gov/.../MapServer/270` - parcels but no year built
- Alameda County: Has parcel boundaries only, assessor data separate
- Marin County: Parcels have UseCd, Acres but no year built
- Napa County: Parcels have landuse, acres but no year built
- San Mateo County: No public year built in parcel layers
- Concord: Parcel layer exists but no assessor data joined
- Sunnyvale: GIS portal but no year built in parcels

**No public GIS endpoint found:**
- Oakland, Fremont: No ArcGIS REST endpoints (use Alameda County data)
- Antioch, Pleasant Hill: Use third-party apps or county auth-required endpoints
- San Rafael: Portal exists but endpoints not publicly accessible
- Mountain View, Cupertino, Los Gatos, Saratoga: No accessible endpoints

**Download only (not REST API):**
- Contra Costa County: Shapefile download at `gis.cccounty.us/Downloads/Assessor/`

**Not thoroughly searched:**
- Gilroy, Morgan Hill, Milpitas (Santa Clara County cities)

**MapServer quirks:**
- Some MapServers don't support `f=geojson` with geometry at scale
- Solution: Use `f=json` and convert ESRI JSON to GeoJSON manually
- Check `spatialReference.wkid` for coordinate system (may need proj4)
- See `fieldline/src/pipelines/berkeley-fetch.ts` for example

## Northern Nevada Data Sources

**Working sources with year built (5 counties, ~250k parcels):**
- Washoe County (Reno/Sparks): ~165k parcels, `YEARBLT` field via REST API
  - Endpoint: `wcgisweb.washoecounty.us/arcgis/rest/services/OpenData/OpenData/MapServer/0`
- Lyon County (Fernley/Dayton/Yerington): ~40k parcels, year built via REST API
  - Endpoint: `gis.lyon-county.org/arcgis/rest/services/Parcels/FeatureServer/0`
- Carson City: ~18k parcels, assessor scrape + geocoding
  - Assessor: `carsoncitynv.devnetwedge.com` (search by year built, scrape results)
- Douglas County (Minden/Gardnerville): ~25k parcels, assessor scrape + geocoding
  - Assessor: `douglasnv-search.gsacorp.io` (search by Original Constr Year, scrape results)
- Storey County (Virginia City): ~2.5k parcels, assessor scrape + geocoding
  - Historic Comstock Lode territory, buildings dating to 1860s
  - Assessor: Uses GSA Corp endpoint similar to Douglas
