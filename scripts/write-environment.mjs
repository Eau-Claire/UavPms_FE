import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'src', 'environments', 'environment.ts');

const apiBaseUrl = process.env.NG_APP_API_BASE_URL ?? 'https://uavpms.ddns.net/api/v1';
const pollIntervalMs = Number(process.env.NG_APP_POLL_INTERVAL_MS ?? '30000');

writeFileSync(
  target,
  `export const environment = ${JSON.stringify({ apiBaseUrl, pollIntervalMs }, null, 2)};\n`,
  'utf8',
);
