import { Storm, TrackPoint, StormStatus, windToCategory } from '../schemas/storm.js';

const HURDAT2_URL = 'https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2023-051124.txt';

export async function fetchHurdat2(): Promise<string> {
  const response = await fetch(HURDAT2_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch HURDAT2: ${response.status}`);
  }
  return response.text();
}

export function parseHurdat2(data: string): Storm[] {
  const lines = data.split('\n').filter(line => line.trim());
  const storms: Storm[] = [];
  let currentStorm: Storm | null = null;
  let expectedPoints = 0;

  for (const line of lines) {
    // Header line: AL092019, DORIAN, 44,
    if (line.match(/^[A-Z]{2}\d{6}/)) {
      if (currentStorm) {
        finalizeStorm(currentStorm);
        storms.push(currentStorm);
      }

      const parts = line.split(',').map(s => s.trim());
      const id = parts[0];
      const name = parts[1] === 'UNNAMED' ? null : parts[1];
      expectedPoints = parseInt(parts[2], 10);
      const basin = id.substring(0, 2) as 'AL' | 'EP';
      const year = parseInt(id.substring(4, 8), 10);

      currentStorm = {
        id,
        name,
        basin,
        year,
        track: [],
        maxWind: 0,
        minPressure: null,
        landfalls: [],
        category: 0,
      };
    } else if (currentStorm) {
      // Track point line
      const point = parseTrackPoint(line);
      if (point) {
        currentStorm.track.push(point);
      }
    }
  }

  if (currentStorm) {
    finalizeStorm(currentStorm);
    storms.push(currentStorm);
  }

  return storms;
}

function parseTrackPoint(line: string): TrackPoint | null {
  const parts = line.split(',').map(s => s.trim());
  if (parts.length < 7) return null;

  // Date: 20190824, Time: 1800
  const dateStr = parts[0];
  const timeStr = parts[1].padStart(4, '0');
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  const hour = timeStr.substring(0, 2);
  const minute = timeStr.substring(2, 4);
  const timestamp = `${year}-${month}-${day}T${hour}:${minute}:00Z`;

  // Record identifier (L = landfall, etc.) - parts[2]
  const recordId = parts[2];

  // Status
  const status = parts[3] as StormStatus;

  // Latitude: 26.1N -> 26.1
  const latStr = parts[4];
  const lat = parseFloat(latStr.slice(0, -1)) * (latStr.endsWith('S') ? -1 : 1);

  // Longitude: 76.5W -> -76.5
  const lonStr = parts[5];
  const lon = parseFloat(lonStr.slice(0, -1)) * (lonStr.endsWith('W') ? -1 : 1);

  // Wind (knots) and Pressure (mb)
  const wind = parseInt(parts[6], 10) || 0;
  const pressure = parts[7] ? parseInt(parts[7], 10) || null : null;

  return {
    timestamp,
    lat,
    lon,
    wind,
    pressure: pressure === -999 ? null : pressure,
    status,
  };
}

function finalizeStorm(storm: Storm): void {
  storm.maxWind = Math.max(...storm.track.map(p => p.wind));

  const pressures = storm.track
    .map(p => p.pressure)
    .filter((p): p is number => p !== null && p > 0);
  storm.minPressure = pressures.length > 0 ? Math.min(...pressures) : null;

  storm.category = windToCategory(storm.maxWind);
}
