/**
 * Toronto building permits fetch pipeline.
 * Uses City of Toronto Open Data Portal (CKAN API).
 *
 * Note: Toronto data doesn't include coordinates directly.
 * The GEO_ID field can be joined with Address Points for geocoding.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { getCache } from '../core/cache.js';

const OUTPUT_DIR = new URL('../../data/raw/toronto', import.meta.url).pathname;

// Toronto Open Data CKAN API - Cleared Building Permits
const API_URL = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search';
const RESOURCE_ID = 'a96c0ba4-3026-402b-b09d-5b1268b8f810'; // cleared permits since 2017
const BATCH_SIZE = 10000;
const SOURCE_ID = 'toronto';

interface TorontoRecord {
  _id: number;
  PERMIT_NUM: string;
  PERMIT_TYPE: string;
  STRUCTURE_TYPE: string;
  WORK: string;
  STREET_NUM: string;
  STREET_NAME: string;
  STREET_TYPE: string;
  STREET_DIRECTION: string;
  POSTAL: string;
  GEO_ID: number;
  ISSUED_DATE: string;
  COMPLETED_DATE: string;
  APPLICATION_DATE: string;
  STATUS: string;
  DESCRIPTION: string;
  CURRENT_USE: string;
  PROPOSED_USE: string;
  EST_CONST_COST: number;
}

interface CKANResponse {
  success: boolean;
  result: {
    records: TorontoRecord[];
    total: number;
  };
}

async function fetchBatch(offset: number): Promise<{ records: TorontoRecord[]; total: number }> {
  const params = new URLSearchParams({
    resource_id: RESOURCE_ID,
    limit: BATCH_SIZE.toString(),
    offset: offset.toString(),
  });

  const url = `${API_URL}?${params}`;
  console.log(`Fetching offset ${offset}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data: CKANResponse = await res.json();
  if (!data.success) {
    throw new Error('CKAN API returned success=false');
  }

  return {
    records: data.result.records,
    total: data.result.total,
  };
}

async function main() {
  console.log('Fetching Toronto Building Permits (Cleared) from City of Toronto Open Data...');
  console.log(`Endpoint: ${API_URL}`);
  console.log(`Resource: ${RESOURCE_ID}\n`);

  // Check cache first
  const cache = await getCache();
  const meta = cache.getSourceMetadata(SOURCE_ID);

  if (meta && !cache.needsRefresh(SOURCE_ID, 24)) {
    console.log(
      `Using cached data (${meta.recordCount.toLocaleString()} records from ${meta.lastFetched})`
    );
    const cached = cache.getFeatures<TorontoRecord>(SOURCE_ID);

    await mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/permits.json`;
    await writeFile(outputPath, JSON.stringify(cached, null, 2));
    console.log(`Wrote ${outputPath} (${cached.length} permits from cache)`);
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Get first batch to learn total
  const first = await fetchBatch(0);
  const total = first.total;
  console.log(`Total records: ${total.toLocaleString()}\n`);

  const allRecords: TorontoRecord[] = [...first.records];
  console.log(`  Batch 0: ${first.records.length} records (total: ${allRecords.length} / ${total})`);

  // Fetch remaining batches
  let offset = BATCH_SIZE;
  let batchNum = 1;

  while (offset < total) {
    const batch = await fetchBatch(offset);
    allRecords.push(...batch.records);
    console.log(
      `  Batch ${batchNum}: ${batch.records.length} records (total: ${allRecords.length} / ${total})`
    );

    offset += BATCH_SIZE;
    batchNum++;

    // Safety limit
    if (batchNum > 100) {
      console.log('Safety limit reached (100 batches)');
      break;
    }
  }

  console.log(`\nFetched ${allRecords.length.toLocaleString()} records`);

  // Cache the results
  cache.upsertFeatures(SOURCE_ID, allRecords, (r) => r.PERMIT_NUM);
  cache.updateSourceMetadata(SOURCE_ID, {
    recordCount: allRecords.length,
  });

  // Write output (JSON since no coordinates available)
  const outputPath = `${OUTPUT_DIR}/permits.json`;
  await writeFile(outputPath, JSON.stringify(allRecords, null, 2));
  console.log(`Wrote ${outputPath} (${allRecords.length} permits)`);

  // Summary stats
  const byType = new Map<string, number>();
  for (const r of allRecords) {
    const type = r.PERMIT_TYPE || 'Unknown';
    byType.set(type, (byType.get(type) || 0) + 1);
  }
  console.log('\nPermit types:');
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${type}: ${count.toLocaleString()}`);
  }

  console.log('\nNote: Toronto data requires geocoding via GEO_ID join with Address Points dataset.');
}

main().catch(console.error);
