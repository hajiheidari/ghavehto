import { fetchBootstrap } from '@ghahvehto/contracts/client';
export async function getBootstrap() {
  const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:4101';
  return fetchBootstrap(base);
}

type DirectoryListing = { id:string; cafeName:string; branchName:string; province:string; city:string; neighborhood:string };
export async function getDirectory(q: string, page: number): Promise<{items:DirectoryListing[]; hasMore:boolean}> {
  const url = new URL('/v1/directory', process.env.API_BASE_URL ?? 'http://127.0.0.1:4101');
  if (q) url.searchParams.set('q',q);
  url.searchParams.set('page',String(page));
  const response = await fetch(url, {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3000)});
  if (!response.ok) throw new Error('Directory unavailable');
  const value = await response.json();
  if (!value || !Array.isArray(value.items) || value.items.length > 24 || typeof value.hasMore !== 'boolean' ||
      !value.items.every((row: Record<string,unknown> | null) => row && ['id','cafeName','branchName','province','city','neighborhood'].every(key => typeof row[key] === 'string'))) {
    throw new Error('Invalid directory response');
  }
  return value;
}
