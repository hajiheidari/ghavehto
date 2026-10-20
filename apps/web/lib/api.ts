import { fetchBootstrap } from '@ghahvehto/contracts/client';
export async function getBootstrap() {
  const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:4101';
  return fetchBootstrap(base);
}
