import { fetchBootstrap } from '@ghahvehto/contracts/client';
export async function getBootstrap() {
  const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:4101';
  return fetchBootstrap(base);
}

type DirectoryListing = { id:string; cafeName:string; branchName:string; province:string; city:string; neighborhood:string };
export const directoryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isListing(input: unknown): input is DirectoryListing {
  if (!input || typeof input !== 'object') return false;
  const row = input as Record<string,unknown>;
  return typeof row.id === 'string' && directoryIdPattern.test(row.id) &&
    ['cafeName','branchName','province','city','neighborhood'].every(key => typeof row[key] === 'string');
}
const directoryFetch = (url: URL) => fetch(url, {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3000)});
const directoryUrl = (path: string) => new URL(path, process.env.API_BASE_URL ?? 'http://127.0.0.1:4101');
export async function getDirectoryBranch(id: string): Promise<DirectoryListing | null> {
  if (!directoryIdPattern.test(id)) return null;
  const response = await directoryFetch(directoryUrl(`/v1/directory/branches/${id}`));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Directory unavailable');
  const value:unknown = await response.json();
  if (!isListing(value) || value.id.toLowerCase() !== id.toLowerCase()) throw new Error('Invalid directory response');
  return value;
}
export async function getDirectory(q: string, page: number): Promise<{items:DirectoryListing[]; hasMore:boolean}> {
  const url = directoryUrl('/v1/directory');
  if (q) url.searchParams.set('q',q);
  url.searchParams.set('page',String(page));
  const response = await directoryFetch(url);
  if (!response.ok) throw new Error('Directory unavailable');
  const value = await response.json();
  if (!value || !Array.isArray(value.items) || value.items.length > 24 || typeof value.hasMore !== 'boolean' ||
      !value.items.every(isListing)) {
    throw new Error('Invalid directory response');
  }
  return value;
}
