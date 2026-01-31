/**
 * Scraper for Storey County Assessor data.
 *
 * Storey County uses DevNet Wedge platform at storeynv.devnetwedge.com
 * (same platform as Carson City)
 *
 * Usage: pnpm --filter fieldline scrape:storey-assessor
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUTPUT_DIR = new URL('../../data/raw/storey', import.meta.url).pathname;
const OUTPUT_PATH = `${OUTPUT_DIR}/assessor.json`;
const CHECKPOINT_PATH = `${OUTPUT_DIR}/assessor-checkpoint.json`;

const BASE_URL = 'https://storeynv.devnetwedge.com';
const SEARCH_URL = `${BASE_URL}/Search/ExecuteParcelSearch`;
const RESULTS_URL = `${BASE_URL}/Search/Results`;

interface ParcelRecord {
  apn: string;
  yearBuilt: number;
  address: string;
  propertyType: string;
  ownerName: string;
}

interface CheckpointData {
  parcels: ParcelRecord[];
  lastYear: number;
  totalFetched: number;
}

// Session cookie storage
let sessionCookie: string | null = null;

// Rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialize session by visiting the home page
 */
async function initSession(): Promise<void> {
  try {
    const response = await fetch(BASE_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
    });

    const cookies = response.headers.getSetCookie?.() || [];
    sessionCookie = cookies.map((c) => c.split(';')[0]).join('; ');
    console.log('Session initialized');
  } catch (error) {
    console.error('Failed to initialize session:', error);
  }
}

/**
 * Search for parcels by year built range and return all results
 */
async function searchByYearRange(
  yearMin: number,
  yearMax: number
): Promise<ParcelRecord[]> {
  if (!sessionCookie) {
    await initSession();
  }

  // Execute search to set session state
  const formData = new URLSearchParams({
    search_tab: 'parcel-search',
    property_key: '',
    address_number_low: '',
    address_number_high: '',
    address_direction_code: '',
    address_street_name: '',
    address_suffix_code: '',
    address_secondary: '',
    owner_name: '',
    owner_address: '',
    year_built_min: yearMin.toString(),
    year_built_max: yearMax.toString(),
    bedrooms_min: '',
    bedrooms_max: '',
    bathrooms_min: '',
    bathrooms_max: '',
    sq_ft_min: '',
    sq_ft_max: '',
    lot_sqft_min: '',
    lot_sqft_max: '',
  });

  try {
    await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: BASE_URL,
        Referer: BASE_URL,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    // Fetch all results via DataTables server-side API
    // Request a large number to get all results at once
    const dataTableParams = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '10000', // Max per request
      'order[0][column]': '1',
      'order[0][dir]': 'asc',
    });

    const resultsResp = await fetch(RESULTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: dataTableParams.toString(),
    });

    if (!resultsResp.ok) {
      console.error(
        `Results fetch failed for ${yearMin}-${yearMax}: ${resultsResp.status}`
      );
      return [];
    }

    interface DataTablesResponse {
      data: Array<{
        property_key: string;
        property_type: string;
        name: string;
        address_site: string;
        site_addresses?: string[];
      }>;
      recordsTotal: number;
    }

    const json = (await resultsResp.json()) as DataTablesResponse;
    const parcels: ParcelRecord[] = [];

    for (const record of json.data) {
      // For single-year searches, we know the exact year
      const yearBuilt = yearMin === yearMax ? yearMin : yearMin;

      parcels.push({
        apn: record.property_key,
        yearBuilt,
        address:
          record.address_site || record.site_addresses?.[0] || '',
        propertyType: record.property_type || 'Parcel',
        ownerName: record.name || '',
      });
    }

    return parcels;
  } catch (error) {
    console.error(`Search error for ${yearMin}-${yearMax}:`, error);
    return [];
  }
}

/**
 * Load checkpoint if exists
 */
async function loadCheckpoint(): Promise<CheckpointData | null> {
  try {
    if (existsSync(CHECKPOINT_PATH)) {
      const content = await readFile(CHECKPOINT_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    console.log('No valid checkpoint found, starting fresh');
  }
  return null;
}

/**
 * Save checkpoint
 */
async function saveCheckpoint(data: CheckpointData): Promise<void> {
  await writeFile(CHECKPOINT_PATH, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('Storey County Assessor Scraper');
  console.log('==============================\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Load checkpoint or start fresh
  const checkpoint = await loadCheckpoint();
  const parcels: ParcelRecord[] = checkpoint?.parcels || [];
  const seenApns = new Set(parcels.map((p) => p.apn));
  const startYear = checkpoint?.lastYear ? checkpoint.lastYear + 1 : 1860;

  console.log(
    checkpoint
      ? `Resuming from checkpoint: ${parcels.length} parcels, starting year ${startYear}`
      : 'Starting fresh scrape'
  );

  // Search by individual years for precise year_built data
  const endYear = new Date().getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    console.log(`\nSearching year ${year}...`);

    const yearParcels = await searchByYearRange(year, year);

    // Filter out already-seen parcels
    const newParcels = yearParcels.filter((p) => !seenApns.has(p.apn));

    for (const parcel of newParcels) {
      parcels.push(parcel);
      seenApns.add(parcel.apn);
    }

    console.log(
      `  Found ${yearParcels.length} parcels, ${newParcels.length} new`
    );

    // Save checkpoint after each year
    await saveCheckpoint({
      parcels,
      lastYear: year,
      totalFetched: parcels.length,
    });

    // Rate limit between years
    await sleep(300);
  }

  // Write final output
  console.log(`\nWriting final output...`);
  await writeFile(OUTPUT_PATH, JSON.stringify(parcels, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} (${parcels.length} parcels)`);

  // Summary by decade
  console.log(`\nSummary by decade:`);
  const decades = new Map<number, number>();
  for (const p of parcels) {
    const decade = Math.floor(p.yearBuilt / 10) * 10;
    decades.set(decade, (decades.get(decade) || 0) + 1);
  }
  const sortedDecades = [...decades.entries()].sort((a, b) => a[0] - b[0]);
  for (const [decade, count] of sortedDecades) {
    console.log(`  ${decade}s: ${count}`);
  }
  console.log(`\n  Total: ${parcels.length} parcels`);
}

main().catch(console.error);
