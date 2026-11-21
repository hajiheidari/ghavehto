import { createApp } from './app.js';
import pg from 'pg';
const runtimePool = process.env.IDENTITY_DATABASE_URL ? new pg.Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 10, connectionTimeoutMillis: 2000 }) : undefined;
const { app } = await createApp({ runtimePool });
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 4101), '127.0.0.1');
if (runtimePool) app.getHttpServer().once('close', () => void runtimePool.end());
console.log(`Ghahvehto API: ${await app.getUrl()}`);
