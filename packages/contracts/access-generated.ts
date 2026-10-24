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
async function scopedRequest(base: string, path: string, token: string, request: typeof fetch, body?: {name: string}): Promise<unknown> {
  const response = await request(new URL(path, base), { method: body ? 'PATCH' : 'GET', headers: { Authorization: 'Bearer '+token, ...(body ? {'Content-Type':'application/json'} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}), signal: AbortSignal.timeout(3000), cache:'no-store' });
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
