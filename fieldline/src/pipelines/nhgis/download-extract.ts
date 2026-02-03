/**
 * Download an NHGIS extract by number.
 *
 * Usage:
 *   NHGIS_API_KEY=... pnpm tsx src/pipelines/nhgis/download-extract.ts <extract_number> <output_dir>
 */

import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createClient } from './lib/nhgis-client.js';

const extractNum = parseInt(process.argv[2], 10);
const outputDir = process.argv[3];

if (!extractNum || !outputDir) {
  console.error('Usage: download-extract.ts <extract_number> <output_dir>');
  process.exit(1);
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const client = createClient();
  console.log(`Downloading extract #${extractNum} to ${outputDir}...`);
  const files = await client.download(extractNum, outputDir);
  console.log(`Downloaded ${files.length} files`);

  for (const file of files) {
    if (file.endsWith('.zip')) {
      console.log(`Extracting ${file}...`);
      execSync(`unzip -o "${file}" -d "${file.replace('.zip', '')}"`, { stdio: 'pipe' });
    }
  }
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
