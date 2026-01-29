export type StormStatus =
  | "TD"   // Tropical Depression
  | "TS"   // Tropical Storm
  | "HU"   // Hurricane
  | "EX"   // Extratropical
  | "SD"   // Subtropical Depression
  | "SS"   // Subtropical Storm
  | "LO"   // Low
  | "WV"   // Tropical Wave
  | "DB";  // Disturbance

export interface TrackPoint {
  timestamp: string;       // ISO 8601
  lat: number;
  lon: number;
  wind: number;            // knots
  pressure: number | null; // mb
  status: StormStatus;
}

export interface Landfall {
  timestamp: string;
  lat: number;
  lon: number;
  wind: number;
  location: string;
}

export interface Storm {
  id: string;              // e.g., "AL092019"
  name: string | null;     // "DORIAN" or null for unnamed
  basin: "AL" | "EP";
  year: number;
  track: TrackPoint[];
  maxWind: number;         // Peak intensity (knots)
  minPressure: number | null;
  landfalls: Landfall[];
  category: number;        // Peak Saffir-Simpson (0-5)
}

export function windToCategory(wind: number): number {
  if (wind >= 137) return 5;
  if (wind >= 113) return 4;
  if (wind >= 96) return 3;
  if (wind >= 83) return 2;
  if (wind >= 64) return 1;
  return 0; // TD or TS
}
