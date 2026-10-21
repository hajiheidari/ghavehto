import { createApp } from './app.js';
const { app } = await createApp();
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 4101), '127.0.0.1');
console.log(`Ghahvehto API: ${await app.getUrl()}`);
