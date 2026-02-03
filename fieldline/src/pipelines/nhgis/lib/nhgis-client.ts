/**
 * NHGIS API client for submitting extracts and downloading data.
 *
 * API documentation: https://developer.ipums.org/docs/v2/workflows/
 * Rate limit: 100 requests/minute (we add 650ms delay between calls)
 */

const NHGIS_API_BASE = 'https://api.ipums.org/extracts';
const NHGIS_COLLECTION_PARAMS = 'collection=nhgis&version=2';
const RATE_LIMIT_DELAY_MS = 650;

export interface ExtractDataset {
  name: string;
  dataTables: string[];
  geogLevels: string[];
}

export interface ExtractRequest {
  description: string;
  datasets: ExtractDataset[];
  dataFormat: 'csv_no_header' | 'csv_header' | 'fixed_width';
  shapefiles?: string[];
  geographicExtents?: string[];
}

export interface ExtractStatus {
  number: number;
  status: 'queued' | 'started' | 'produced' | 'completed' | 'canceled' | 'failed';
  downloadLinks?: {
    tableData?: string;
    gisData?: string;
    codebook?: string;
  };
}

export interface NHGISClient {
  submitExtract(request: ExtractRequest): Promise<{ number: number }>;
  getStatus(extractNumber: number): Promise<ExtractStatus>;
  waitForCompletion(extractNumber: number, pollIntervalMs?: number): Promise<ExtractStatus>;
  download(extractNumber: number, outputDir: string): Promise<string[]>;
}

function getApiKey(): string {
  const key = process.env.NHGIS_API_KEY;
  if (!key) {
    throw new Error(
      'NHGIS_API_KEY environment variable not set.\n' +
      'Get your API key from: https://account.ipums.org/api_keys'
    );
  }
  return key;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  await delay(RATE_LIMIT_DELAY_MS);

  const separator = path.includes('?') ? '&' : '?';
  const url = `${NHGIS_API_BASE}${path}${separator}${NHGIS_COLLECTION_PARAMS}`;
  const headers: Record<string, string> = {
    'Authorization': getApiKey(),
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NHGIS API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function submitExtract(request: ExtractRequest): Promise<{ number: number }> {
  console.log('Submitting NHGIS extract request...');

  const payload = {
    description: request.description,
    datasets: Object.fromEntries(
      request.datasets.map(ds => [
        ds.name,
        {
          dataTables: ds.dataTables,
          geogLevels: ds.geogLevels,
        },
      ])
    ),
    dataFormat: request.dataFormat,
    ...(request.shapefiles && { shapefiles: request.shapefiles }),
    ...(request.geographicExtents && { geographicExtents: request.geographicExtents }),
  };

  const result = await apiRequest<{ number: number }>('POST', '/', payload);
  console.log(`Extract submitted: #${result.number}`);
  return result;
}

export async function getStatus(extractNumber: number): Promise<ExtractStatus> {
  const result = await apiRequest<{
    number: number;
    status: ExtractStatus['status'];
    downloadLinks?: {
      tableData?: { url: string };
      gisData?: { url: string };
      codebookPreview?: { url: string };
    };
  }>('GET', `/${extractNumber}`);

  return {
    number: result.number,
    status: result.status,
    downloadLinks: result.downloadLinks ? {
      tableData: result.downloadLinks.tableData?.url,
      gisData: result.downloadLinks.gisData?.url,
      codebook: result.downloadLinks.codebookPreview?.url,
    } : undefined,
  };
}

export async function waitForCompletion(
  extractNumber: number,
  pollIntervalMs = 30000
): Promise<ExtractStatus> {
  console.log(`Waiting for extract #${extractNumber} to complete...`);

  let attempts = 0;
  const maxAttempts = 120; // 1 hour max at 30s intervals

  while (attempts < maxAttempts) {
    const status = await getStatus(extractNumber);

    console.log(`  Status: ${status.status} (attempt ${attempts + 1})`);

    if (status.status === 'completed') {
      console.log('Extract completed!');
      return status;
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`Extract ${extractNumber} ${status.status}`);
    }

    await delay(pollIntervalMs);
    attempts++;
  }

  throw new Error(`Extract ${extractNumber} timed out after ${maxAttempts} attempts`);
}

export async function download(
  extractNumber: number,
  outputDir: string
): Promise<string[]> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const status = await getStatus(extractNumber);

  if (status.status !== 'completed') {
    throw new Error(`Extract ${extractNumber} is not completed (status: ${status.status})`);
  }

  if (!status.downloadLinks) {
    throw new Error(`No download links available for extract ${extractNumber}`);
  }

  await mkdir(outputDir, { recursive: true });
  const downloadedFiles: string[] = [];

  const links = status.downloadLinks;
  const downloads: Array<{ name: string; url: string | undefined }> = [
    { name: 'table_data.zip', url: links.tableData },
    { name: 'gis_data.zip', url: links.gisData },
    { name: 'codebook.txt', url: links.codebook },
  ];

  for (const { name, url } of downloads) {
    if (!url) continue;

    console.log(`Downloading ${name}...`);
    await delay(RATE_LIMIT_DELAY_MS);

    const response = await fetch(url, {
      headers: { 'Authorization': getApiKey() },
    });

    if (!response.ok) {
      throw new Error(`Failed to download ${name}: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = join(outputDir, name);
    await writeFile(filePath, buffer);
    downloadedFiles.push(filePath);
    console.log(`  Saved: ${filePath}`);
  }

  return downloadedFiles;
}

export function createClient(): NHGISClient {
  return {
    submitExtract,
    getStatus,
    waitForCompletion,
    download,
  };
}
