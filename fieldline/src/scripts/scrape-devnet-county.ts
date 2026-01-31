/**
 * Generic DevNet Wedge assessor scraper for Nevada counties.
 * 
 * DevNet counties: Churchill, Pershing, White Pine, Nye, Mineral
 * 
 * Usage: node --import tsx src/scripts/scrape-devnet-county.ts <county>
 * Example: node --import tsx src/scripts/scrape-devnet-county.ts churchill
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const COUNTY = process.argv[2];
if (!COUNTY) {
  console.error('Usage: scrape-devnet-county.ts <county>');
  console.error('Counties: churchill, pershing, whitepine, nye, mineral');
  process.exit(1);
}

const DEVNET_URLS: Record<string, string> = {
  churchill: 'https://churchillnv.devnetwedge.com',
  pershing: 'https://pershingnv.devnetwedge.com',
  whitepine: 'https://whitepinenv.devnetwedge.com',
  nye: 'https://nyenv-assessor.devnetwedge.com',
  mineral: 'https://mineralnv.devnetwedge.com',
};

const BASE_URL = DEVNET_URLS[COUNTY];
if (!BASE_URL) {
  console.error(`Unknown county: ${COUNTY}`);
  process.exit(1);
}

const dirName = COUNTY === 'whitepine' ? 'white-pine' : COUNTY;
const OUTPUT_DIR = new URL(`../../data/raw/${dirName}`, import.meta.url).pathname;
const OUTPUT_PATH = `${OUTPUT_DIR}/assessor.json`;
const CHECKPOINT_PATH = `${OUTPUT_DIR}/assessor-checkpoint.json`;

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

let sessionCookie: string | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initSession(): Promise<void> {
  try {
    const response = await fetch(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        Accept: 'text/html',
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

async function searchByYearRange(yearMin: number, yearMax: number): Promise<ParcelRecord[]> {
  if (!sessionCookie) {
    await initSession();
  }

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
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        Origin: BASE_URL,
        Referer: BASE_URL,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    const dataTableParams = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '10000',
      'order[0][column]': '1',
      'order[0][dir]': 'asc',
    });

    const resultsResp = await fetch(RESULTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: dataTableParams.toString(),
    });

    if (!resultsResp.ok) return [];

    interface DataTablesResponse {
      data: Array<{
        property_key: string;
        property_type: string;
        name: string;
        address_site: string;
        site_addresses?: string[];
      }>;
    }

    const json = (await resultsResp.json()) as DataTablesResponse;
    const parcels: ParcelRecord[] = [];

    for (const record of json.data) {
      parcels.push({
        apn: record.property_key,
        yearBuilt: yearMin,
        address: record.address_site || record.site_addresses?.[0] || '',
        propertyType: record.property_type || 'Parcel',
        ownerName: record.name || '',
      });
    }

    return parcels;
  } catch {
    return [];
  }
}

async function loadCheckpoint(): Promise<CheckpointData | null> {
  try {
    if (existsSync(CHECKPOINT_PATH)) {
      return JSON.parse(await readFile(CHECKPOINT_PATH, 'utf-8'));
    }
  } catch { }
  return null;
}

async function saveCheckpoint(data: CheckpointData): Promise<void> {
  await writeFile(CHECKPOINT_PATH, JSON.stringify(data, null, 2));
}

async function main() {
  const displayName = COUNTY.charAt(0).toUpperCase() + COUNTY.slice(1);
  console.log(`${displayName} County Assessor Scraper (DevNet Wedge)`);
  console.log('='.repeat(50) + '\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  const checkpoint = await loadCheckpoint();
  const parcels: ParcelRecord[] = checkpoint?.parcels || [];
  const seenApns = new Set(parcels.map((p) => p.apn));
  const startYear = checkpoint?.lastYear ? checkpoint.lastYear + 1 : 1860;

  console.log(checkpoint ? `Resuming from year ${startYear}` : 'Starting fresh');

  const endYear = new Date().getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    console.log(`\nSearching year ${year}...`);

    const yearParcels = await searchByYearRange(year, year);
    const newParcels = yearParcels.filter((p) => !seenApns.has(p.apn));

    for (const parcel of newParcels) {
      parcels.push(parcel);
      seenApns.add(parcel.apn);
    }

    console.log(`  Found ${yearParcels.length} parcels, ${newParcels.length} new`);

    await saveCheckpoint({ parcels, lastYear: year, totalFetched: parcels.length });
    await sleep(300);
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(parcels, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH} (${parcels.length} parcels)`);
}

main().catch(console.error);
