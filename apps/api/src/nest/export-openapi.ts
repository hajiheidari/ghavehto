import { writeFile } from 'node:fs/promises';
import { createApp } from './app.js';
const { app, document } = await createApp();
try {
  await writeFile(new URL('../../../../packages/contracts/openapi.json', import.meta.url), JSON.stringify(document, null, 2) + '\n');
} finally { await app.close(); }
