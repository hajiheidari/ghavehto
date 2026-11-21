// Generated from OpenAPI. Do not edit.
export interface CafeAccessResponse { cafeId: string; name: string; }
export function parseCafeAccess(input: unknown): CafeAccessResponse {
  if (!input || typeof input !== 'object') throw new Error('Invalid CafeAccess');
  const value = input as Record<string, unknown>;
  if (typeof value.cafeId !== 'string' || !new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").test(value.cafeId as string)) throw new Error('Invalid cafeId');
  if (typeof value.name !== 'string') throw new Error('Invalid name');
  return value as unknown as CafeAccessResponse;
}
export interface BranchAccessResponse { branchId: string; cafeId: string; name: string; }
export function parseBranchAccess(input: unknown): BranchAccessResponse {
  if (!input || typeof input !== 'object') throw new Error('Invalid BranchAccess');
  const value = input as Record<string, unknown>;
  if (typeof value.branchId !== 'string' || !new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").test(value.branchId as string)) throw new Error('Invalid branchId');
  if (typeof value.cafeId !== 'string' || !new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").test(value.cafeId as string)) throw new Error('Invalid cafeId');
  if (typeof value.name !== 'string') throw new Error('Invalid name');
  return value as unknown as BranchAccessResponse;
}
export interface SessionStatusResponse { userId: string; sessionId: string; }
export function parseSessionStatus(input: unknown): SessionStatusResponse {
  if (!input || typeof input !== 'object') throw new Error('Invalid SessionStatus');
  const value = input as Record<string, unknown>;
  if (typeof value.userId !== 'string' || !new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").test(value.userId as string)) throw new Error('Invalid userId');
  if (typeof value.sessionId !== 'string' || !new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").test(value.sessionId as string)) throw new Error('Invalid sessionId');
  return value as unknown as SessionStatusResponse;
}
export interface SessionTokensResponse { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string; }
export function parseSessionTokens(input: unknown): SessionTokensResponse {
  if (!input || typeof input !== 'object') throw new Error('Invalid SessionTokens');
  const value = input as Record<string, unknown>;
  if (typeof value.accessToken !== 'string' || !new RegExp("^[A-Za-z0-9_-]{43}$").test(value.accessToken as string)) throw new Error('Invalid accessToken');
  if (typeof value.refreshToken !== 'string' || !new RegExp("^[A-Za-z0-9_-]{43}$").test(value.refreshToken as string)) throw new Error('Invalid refreshToken');
  if (typeof value.accessExpiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.accessExpiresAt as string) || !Number.isFinite(Date.parse(value.accessExpiresAt as string)) || new Date(value.accessExpiresAt as string).toISOString() !== value.accessExpiresAt) throw new Error('Invalid accessExpiresAt');
  if (typeof value.refreshExpiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.refreshExpiresAt as string) || !Number.isFinite(Date.parse(value.refreshExpiresAt as string)) || new Date(value.refreshExpiresAt as string).toISOString() !== value.refreshExpiresAt) throw new Error('Invalid refreshExpiresAt');
  return value as unknown as SessionTokensResponse;
}
async function scopedRequest(base: string, path: string, token: string, request: typeof fetch, body?: {name: string}): Promise<unknown> {
  const response = await request(new URL(path, base), { method: body ? 'PATCH' : 'GET', headers: { Authorization: 'Bearer '+token, ...(body ? {'Content-Type':'application/json'} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}), signal: AbortSignal.timeout(3000), cache:'no-store', credentials:'omit', redirect:'error' });
  if (!response.ok) throw new Error('Scoped API request rejected');
  return response.json();
}
export async function fetchCafeAccess(base: string, cafeId: string, token: string, request: typeof fetch = fetch): Promise<CafeAccessResponse> {
  return parseCafeAccess(await scopedRequest(base, '/v1/cafes/'+encodeURIComponent(cafeId)+'/access', token, request));
}
export async function fetchBranchAccess(base: string, cafeId: string, branchId: string, token: string, request: typeof fetch = fetch): Promise<BranchAccessResponse> {
  return parseBranchAccess(await scopedRequest(base, '/v1/cafes/'+encodeURIComponent(cafeId)+'/branches/'+encodeURIComponent(branchId)+'/access', token, request));
}
export async function updateCafeProfile(base: string, cafeId: string, name: string, token: string, request: typeof fetch = fetch): Promise<CafeAccessResponse> {
  return parseCafeAccess(await scopedRequest(base, '/v1/cafes/'+encodeURIComponent(cafeId)+'/profile', token, request, {name}));
}
export async function fetchSessionStatus(base: string, token: string, request: typeof fetch = fetch): Promise<SessionStatusResponse> {
  return parseSessionStatus(await scopedRequest(base, '/v1/session', token, request));
}
export async function refreshSession(base: string, refreshToken: string, request: typeof fetch = fetch): Promise<SessionTokensResponse> {
  const response = await request(new URL('/v1/session/refresh', base), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken}),signal:AbortSignal.timeout(3000),cache:'no-store',credentials:'omit',redirect:'error'});
  if (!response.ok) throw new Error('Session refresh rejected');
  return parseSessionTokens(await response.json());
}
export async function logoutSession(base: string, accessToken: string, request: typeof fetch = fetch): Promise<void> {
  const response = await request(new URL('/v1/session/logout', base), {method:'POST',headers:{Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(3000),cache:'no-store',credentials:'omit',redirect:'error'});
  if (!response.ok || (await response.json() as {revoked?:unknown}).revoked !== true) throw new Error('Session logout rejected');
}
