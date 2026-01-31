/**
 * Generic GSA Corp assessor scraper for Nevada counties.
 * 
 * GSA Corp counties: Elko, Humboldt, Lander, Eureka
 * 
 * Usage: node --import tsx src/scripts/scrape-gsa-county.ts <county>
 * Example: node --import tsx src/scripts/scrape-gsa-county.ts elko
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const COUNTY = process.argv[2];
if (!COUNTY) {
  console.error('Usage: scrape-gsa-county.ts <county>');
  console.error('Counties: elko, humboldt, lander, eureka');
  process.exit(1);
}

const GSA_URLS: Record<string, string> = {
  elko: 'https://elko-search.gsacorp.io',
  humboldt: 'https://humboldt-search.gsacorp.io',
  lander: 'https://lander-search.gsacorp.io',
  eureka: 'https://eureka-search.gsacorp.io',
};

const BASE_URL = GSA_URLS[COUNTY];
if (!BASE_URL) {
  console.error(`Unknown county: ${COUNTY}`);
  process.exit(1);
}

const OUTPUT_DIR = new URL(`../../data/raw/${COUNTY}`, import.meta.url).pathname;
const OUTPUT_PATH = `${OUTPUT_DIR}/assessor.json`;
const CHECKPOINT_PATH = `${OUTPUT_DIR}/assessor-checkpoint.json`;

interface ParcelRecord {
  apn: string;
  yearBuilt: number;
  address: string;
  propertyType: string;
  propertyTypeCode: string;
  ownerName: string;
}

interface CheckpointData {
  parcels: ParcelRecord[];
  lastYear: number;
  totalFetched: number;
}

let sessionToken: string | null = null;
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
    });

    const cookies = response.headers.getSetCookie?.() || [];
    sessionCookie = cookies.map((c) => c.split(';')[0]).join('; ');

    const html = await response.text();
    const tokenMatch = html.match(/name="token"\s*value="([^"]+)"/i);
    sessionToken = tokenMatch ? tokenMatch[1] : null;

    console.log('Session initialized:', sessionToken ? 'token acquired' : 'no token');
  } catch (error) {
    console.error('Failed to initialize session:', error);
  }
}

function parseSearchResults(html: string): ParcelRecord[] {
  const parcels: ParcelRecord[] = [];
  const rowRegex = /<tr\s*>\s*<td[^>]*><a href="\/parcels\/(\d+)">([^<]+)<\/a>[\s\S]*?<\/td>\s*<td[^>]*[^>]*><abbr[^>]*>(\d+)<\/abbr><\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const [, parcelId, , typeCode, owner, address] = match;
    parcels.push({
      apn: parcelId,
      yearBuilt: 0,
      address: address.trim(),
      propertyType: typeCode.startsWith('2') ? 'Residential' : typeCode.startsWith('3') ? 'Commercial' : 'Other',
      propertyTypeCode: typeCode,
      ownerName: owner.trim(),
    });
  }

  return parcels;
}

async function searchByYearRange(yearMin: number, yearMax: number): Promise<ParcelRecord[]> {
  if (!sessionToken) {
    await initSession();
  }

  const allParcels: ParcelRecord[] = [];
  let page = 1;

  while (page <= 100) {
    const formData = new URLSearchParams({
      type: 'r',
      token: sessionToken || '',
      'query[bld][constr_yr][min]': yearMin.toString(),
      'query[bld][constr_yr][max]': yearMax.toString(),
    });

    try {
      let response;
      if (page === 1) {
        response = await fetch(`${BASE_URL}/search/adv`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
            ...(sessionCookie ? { Cookie: sessionCookie } : {}),
            Referer: BASE_URL,
          },
          body: formData.toString(),
          redirect: 'follow',
        });
      } else {
        response = await fetch(`${BASE_URL}/search/adv/r/${page}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
            ...(sessionCookie ? { Cookie: sessionCookie } : {}),
          },
        });
      }

      if (!response.ok) break;

      const html = await response.text();
      const pageParcels = parseSearchResults(html);

      for (const parcel of pageParcels) {
        parcel.yearBuilt = yearMin;
        allParcels.push(parcel);
      }

      const pageMatch = html.match(/page\s*(\d+)\s*of\s*(\d+)/i);
      if (!pageMatch || parseInt(pageMatch[1], 10) >= parseInt(pageMatch[2], 10)) break;

      page++;
      await sleep(200);
    } catch {
      break;
    }
  }

  return allParcels;
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
  console.log(`${COUNTY.charAt(0).toUpperCase() + COUNTY.slice(1)} County Assessor Scraper (GSA Corp)`);
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
