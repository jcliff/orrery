/**
 * Scraper for Douglas County Assessor data.
 *
 * Douglas County uses GSA Corp platform at douglasnv-search.gsacorp.io
 * This scraper fetches parcels by construction year using the advanced search.
 *
 * Usage: pnpm --filter fieldline scrape:douglas-assessor
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUTPUT_DIR = new URL('../../data/raw/douglas', import.meta.url).pathname;
const OUTPUT_PATH = `${OUTPUT_DIR}/assessor.json`;
const CHECKPOINT_PATH = `${OUTPUT_DIR}/assessor-checkpoint.json`;

const BASE_URL = 'https://douglasnv-search.gsacorp.io';

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

// Session state
let sessionToken: string | null = null;
let sessionCookie: string | null = null;

// Rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialize session by getting token from home page
 */
async function initSession(): Promise<void> {
  try {
    const response = await fetch(BASE_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });

    const cookies = response.headers.getSetCookie?.() || [];
    sessionCookie = cookies.map((c) => c.split(';')[0]).join('; ');

    const html = await response.text();
    const tokenMatch = html.match(/name="token"\s*value="([^"]+)"/i);
    sessionToken = tokenMatch ? tokenMatch[1] : null;

    console.log(
      'Session initialized:',
      sessionToken ? 'token acquired' : 'no token'
    );
  } catch (error) {
    console.error('Failed to initialize session:', error);
  }
}

/**
 * Parse search results HTML to extract parcel data
 */
function parseSearchResults(html: string): ParcelRecord[] {
  const parcels: ParcelRecord[] = [];

  // The results are in table rows with format:
  // <tr><td><a href="/parcels/XXXX">APN</a></td><td>Type</td><td>Owner</td><td>Address</td>...</tr>
  const rowRegex =
    /<tr\s*>\s*<td[^>]*><a href="\/parcels\/(\d+)">([^<]+)<\/a>[\s\S]*?<\/td>\s*<td[^>]*[^>]*><abbr[^>]*>(\d+)<\/abbr><\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const [, parcelId, apnFormatted, typeCode, owner, address] = match;
    parcels.push({
      apn: parcelId, // 12-digit internal ID
      yearBuilt: 0, // Will be set from search year
      address: address.trim(),
      propertyType: getPropertyTypeName(typeCode),
      propertyTypeCode: typeCode,
      ownerName: owner.trim(),
    });
  }

  return parcels;
}

/**
 * Map property type code to name
 */
function getPropertyTypeName(code: string): string {
  const types: Record<string, string> = {
    '100': 'Vacant Land',
    '200': 'Single Family',
    '210': 'Single Family',
    '220': 'Single Family',
    '230': 'Single Family',
    '240': 'Multi-Family',
    '250': 'Multi-Family',
    '300': 'Commercial',
    '400': 'Industrial',
    '500': 'Agricultural',
    '600': 'Government',
    '700': 'Utilities',
    '800': 'Exempt',
  };

  // Check prefixes
  for (const [prefix, name] of Object.entries(types)) {
    if (code.startsWith(prefix.charAt(0))) {
      return name;
    }
  }
  return 'Other';
}

/**
 * Search for parcels by construction year range
 */
async function searchByYearRange(
  yearMin: number,
  yearMax: number
): Promise<ParcelRecord[]> {
  if (!sessionToken) {
    await initSession();
  }

  const allParcels: ParcelRecord[] = [];
  let page = 1;
  const maxPages = 100; // Safety limit

  while (page <= maxPages) {
    const formData = new URLSearchParams({
      type: 'r', // 'r' for real estate/parcels
      token: sessionToken || '',
      'query[bld][constr_yr][min]': yearMin.toString(),
      'query[bld][constr_yr][max]': yearMax.toString(),
    });

    try {
      // For page 1, POST to /search/adv
      // For subsequent pages, GET /search/adv/r/{page}
      let response;
      if (page === 1) {
        response = await fetch(`${BASE_URL}/search/adv`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...(sessionCookie ? { Cookie: sessionCookie } : {}),
            Referer: BASE_URL,
          },
          body: formData.toString(),
          redirect: 'follow',
        });
      } else {
        response = await fetch(`${BASE_URL}/search/adv/r/${page}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...(sessionCookie ? { Cookie: sessionCookie } : {}),
            Referer: `${BASE_URL}/search/adv/r/${page - 1}`,
          },
        });
      }

      if (!response.ok) {
        console.error(
          `Search failed for ${yearMin}-${yearMax} page ${page}: ${response.status}`
        );
        break;
      }

      const html = await response.text();

      // Parse results
      const pageParcels = parseSearchResults(html);

      // Set year built from search
      for (const parcel of pageParcels) {
        parcel.yearBuilt = yearMin === yearMax ? yearMin : yearMin;
        allParcels.push(parcel);
      }

      // Check for more pages
      const pageMatch = html.match(/page\s*(\d+)\s*of\s*(\d+)/i);
      if (!pageMatch) break;

      const currentPage = parseInt(pageMatch[1], 10);
      const totalPages = parseInt(pageMatch[2], 10);

      if (currentPage >= totalPages) break;

      page++;
      await sleep(200); // Rate limit between pages
    } catch (error) {
      console.error(`Search error for ${yearMin}-${yearMax} page ${page}:`, error);
      break;
    }
  }

  return allParcels;
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
  console.log('Douglas County Assessor Scraper');
  console.log('===============================\n');

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
