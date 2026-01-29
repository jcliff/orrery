declare module 'shapefile' {
  export interface FeatureCollection<G = GeoJSON.Geometry, P = GeoJSON.GeoJsonProperties> {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      properties: P;
      geometry: G;
    }>;
  }

  export interface ShapefileFeature {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: any;
    geometry: { type: string; coordinates: unknown };
  }

  export interface ShapefileSource {
    read(): Promise<{ done: boolean; value: ShapefileFeature }>;
  }

  export function read(
    shpPath: string,
    dbfPath?: string,
    options?: { encoding?: string }
  ): Promise<FeatureCollection>;

  export function open(
    shpPath: string,
    dbfPath?: string,
    options?: { encoding?: string }
  ): Promise<ShapefileSource>;
}
