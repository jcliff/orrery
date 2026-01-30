# Orrery

Timelapse visualization platform for geospatial data. Watch cities grow, storms form, and networks expand.

## Visualizations

- **Railroads** — US railroad network expansion (1850–1876)
- **Hurricanes** — Atlantic hurricane tracks (1851–present)
- **Bay Area** — Regional building development (1848–present, 770k+ parcels)
  - SF Urban, Palo Alto, Campbell, Solano, Livermore
  - Santa Clara, Hayward, Sonoma, Santa Rosa
  - Pittsburg, Walnut Creek, Brentwood, Berkeley

## Quick Start

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and pick a visualization.

## Architecture

```
orrery/
├── fieldline/          # Data acquisition & normalization
│   ├── src/pipelines/  # ETL for each dataset
│   ├── src/sources/    # Parsers (HURDAT2, shapefiles, etc.)
│   └── data/           # Raw → processed data
│
└── chrona/             # Rendering & animation engine
    ├── src/core/       # Timeline, temporal filtering
    ├── src/components/ # React UI components
    └── src/visualizations/  # Config per dataset
```

**Data flow:** Raw source → Fieldline pipeline → GeoJSON/PMTiles → Chrona → MapLibre GL

## Commands

```bash
# Development
pnpm dev                              # Run the app
pnpm build                            # Build everything
pnpm lint                             # Lint all packages

# Data pipelines
pnpm --filter fieldline pipeline:railroads       # Process railroad network
pnpm --filter fieldline pipeline:hurricanes      # Process hurricane data
pnpm --filter fieldline pipeline:sf-urban        # Process SF buildings

# Bay Area parcels (each city has fetch → process → tiles pipeline)
pnpm --filter fieldline pipeline:berkeley-fetch  # Example: fetch Berkeley data
pnpm --filter fieldline pipeline:berkeley        # Process into GeoJSON
pnpm --filter fieldline pipeline:berkeley-tiles  # Generate PMTiles
# Available cities: palo-alto, campbell, solano, livermore, santa-clara,
# hayward, sonoma, santa-rosa, pittsburg, walnut-creek, brentwood, berkeley
```

## Tech Stack

- **Monorepo:** pnpm workspaces
- **Language:** TypeScript
- **Rendering:** MapLibre GL JS
- **UI:** React
- **Build:** Vite
- **Data:** GeoJSON, PMTiles (vector tiles)

## License

MIT
