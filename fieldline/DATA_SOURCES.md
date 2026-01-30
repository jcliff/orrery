# Bay Area Parcel Data Sources

This document tracks parcel data sources with year built information for the Orrery urban development visualization.

## Current Coverage (411k+ parcels)

| Region | Parcels | Year Built % | Years | Status |
|--------|---------|--------------|-------|--------|
| San Francisco | 212,000 | 95% | 1848-2024 | ✅ Live |
| Palo Alto | 25,479 | 90% | 1880-2025 | ✅ Live |
| Campbell | 39,669 | 96% | 1840-2025 | ✅ Live |
| Solano County | 133,914 | 99.9% | 1850-2025 | ✅ Live |
| **TOTAL** | **411,062** | | | |

## Confirmed Working - Ready to Add

### Livermore, CA
- **Endpoint**: `https://gis.cityoflivermore.net/arcgis/rest/services/Parcels/FeatureServer/0`
- **Parcels**: 52,196 total, 46,114 with year built (88%)
- **Fields**: `YrBuilt`, `APN`, `SitusNum`, `SitusStreet`, `LandUseDescription`, `LotSize`, `BldgArea`
- **Status**: Ready for pipeline

## Data Source Patterns

### ArcGIS FeatureServer (Most Common)
```
https://gis.[city].gov/arcgis/rest/services/[Parcels|BaseFeatureLayers]/[LayerName]/FeatureServer/0/query
```

Query parameters:
```
where=1=1
outFields=APN,YEARBUILT,ADDRESS,LANDUSE
returnGeometry=true
outSR=4326
f=geojson
resultOffset=0
resultRecordCount=2000
```

Year built field names vary:
- `YEARBUILT`, `YEAR_BUILT`, `YrBuilt`, `yrbuilt`, `year_built`, `year_property_built`

### Socrata SODA API
```
https://data.[county].gov/resource/[dataset-id].json
```

Example: SF uses `https://data.sfgov.org/resource/wv5m-vpq2.json`

## Investigated - No Year Built Data

| Source | Parcels | Issue |
|--------|---------|-------|
| Alameda County | 489,457 | Geometry only, no year built |
| Sunnyvale | ~40,000 | Basic address fields only |
| Santa Clara County Socrata | 499,929 | Dataset requires auth or is empty |

## To Investigate

### Santa Clara County Cities (High Priority)
- [ ] San Jose - Largest South Bay city, check county assessor
- [ ] Mountain View - Try city GIS portal
- [ ] Santa Clara (city) - Near Campbell
- [ ] Cupertino - Tech hub
- [ ] Los Gatos - Affluent area
- [ ] Milpitas - Growing city
- [ ] Morgan Hill - Southern SCC

### East Bay (Alameda + Contra Costa)
- [ ] Oakland - Major city, check city GIS
- [ ] Berkeley - University area
- [ ] Fremont - Large East Bay city
- [ ] Hayward - Check city GIS
- [ ] Richmond - Contra Costa
- [x] Livermore - **CONFIRMED: 46k parcels with year built**
- [ ] Pleasanton - Tri-Valley
- [ ] Dublin - Tri-Valley
- [ ] Walnut Creek - Contra Costa

### San Mateo County
- [ ] Redwood City - Check city GIS
- [ ] San Mateo (city) - County seat
- [ ] Daly City - Near SF
- [ ] South San Francisco - Industrial
- [ ] Burlingame - Peninsula

### North Bay (Marin, Sonoma, Napa)
- [ ] Marin County - Check county GIS
- [ ] San Rafael - Marin county seat
- [ ] Napa County - Wine country, may have historic data
- [ ] Sonoma County - Check county GIS

## Statewide Expansion Notes

### California Counties with Open Data
Many California counties publish parcel data via:
1. County Assessor websites
2. County GIS portals
3. ArcGIS Hub
4. Socrata open data

### Key Fields to Look For
- `YEARBUILT` / `YEAR_BUILT` / `YrBuilt` - Construction year
- `APN` - Assessor Parcel Number (for clustering)
- `LANDUSE` / `UseCode` - Zoning/use type
- `SITUSADDR` - Property address
- `LOTSIZE` / `ACRES` - Parcel area

### Pagination Strategies
1. **exceededTransferLimit**: ArcGIS returns this flag when more data available
2. **Count-based**: Query count first, paginate by offset
3. **OBJECTID-based**: Use `WHERE OBJECTID > lastId` for stable pagination

## Scripts Reference

```bash
# Fetch raw parcel data
pnpm --filter fieldline pipeline:[city]-fetch

# Process into aggregated + detailed GeoJSON
pnpm --filter fieldline pipeline:[city]

# Generate PMTiles for large datasets (>100k)
pnpm --filter fieldline pipeline:[city]-tiles
```

## Architecture Notes

### Two-Tier Rendering
- **Zoom < 15**: Aggregated point clusters (fast)
- **Zoom >= 15**: Detailed polygon parcels (precise)

### Block-Aware Clustering
APNs contain book-page-parcel structure. Extract book-page for block grouping to prevent cross-street clustering.

Examples:
- Palo Alto: `120-26-103` → block `120-26`
- Campbell: `26401022` → block `26401`
- Solano: Uses first 3 digits of parcel ID

### Color Coding by Land Use
| Use Type | Color |
|----------|-------|
| Single Family | `#3498db` (blue) |
| Multi-Family | `#9b59b6` (purple) |
| Commercial | `#e74c3c` (red) |
| Industrial | `#7f8c8d` (gray) |
| Open Space | `#27ae60` (green) |
| Public | `#2ecc71` (light green) |
