import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const document = JSON.parse(await readFile(new URL('packages/contracts/openapi.json', root), 'utf8'));
const uuid = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const models = [['CafeAccess', 'CafeAccessDto'], ['BranchAccess', 'BranchAccessDto'], ['SessionStatus', 'SessionStatusDto'], ['SessionTokens', 'SessionTokensDto']];
let ts = '// Generated from OpenAPI. Do not edit.\n';
let dart = '// Generated from OpenAPI. Do not edit.\n';
for (const [name, schemaName] of models) {
  const schema = document.components.schemas[schemaName];
  if (!schema?.properties || Object.entries(schema.properties).some(([key, field]) => field.type !== 'string' || !schema.required?.includes(key) || (field.format && !['uuid','date-time'].includes(field.format)) || (field.pattern && field.pattern !== '^[A-Za-z0-9_-]{43}$'))) throw new Error(`Unsupported access schema: ${schemaName}`);
  const fields = Object.entries(schema.properties);
  ts += `export interface ${name}Response { ${fields.map(([key]) => `${key}: string;`).join(' ')} }\n`;
  ts += `export function parse${name}(input: unknown): ${name}Response {\n  if (!input || typeof input !== 'object') throw new Error('Invalid ${name}');\n  const value = input as Record<string, unknown>;\n`;
  for (const [key, field] of fields) ts += `  if (typeof value.${key} !== 'string'${field.format === 'uuid' || field.pattern ? ` || !new RegExp(${JSON.stringify(field.pattern ?? uuid)}).test(value.${key} as string)` : ''}${field.format === 'date-time' ? ` || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value.${key} as string) || !Number.isFinite(Date.parse(value.${key} as string)) || new Date(value.${key} as string).toISOString() !== value.${key}` : ''}) throw new Error('Invalid ${key}');\n`;
  ts += `  return value as unknown as ${name}Response;\n}\n`;
  dart += `class ${name}Response {\n${fields.map(([key]) => `  final String ${key};`).join('\n')}\n  const ${name}Response({${fields.map(([key]) => `required this.${key}`).join(', ')}});\n  factory ${name}Response.fromJson(Map<String, dynamic> value) {\n`;
  for (const [key, field] of fields) dart += `    if (value['${key}'] is! String${field.format === 'uuid' || field.pattern ? ` || !RegExp(r${JSON.stringify(field.pattern ?? uuid)}).hasMatch(value['${key}'] as String)` : ''}${field.format === 'date-time' ? ` || DateTime.tryParse(value['${key}'] as String)?.toUtc().toIso8601String() != value['${key}']` : ''}) throw const FormatException('Invalid ${key}');\n`;
  dart += `    return ${name}Response(${fields.map(([key]) => `${key}: value['${key}'] as String`).join(', ')});\n  }\n}\n`;
}
// Narrow helpers for these reviewed paths; not a general business-schema generator.
ts += `async function scopedRequest(base: string, path: string, token: string, request: typeof fetch, body?: {name: string}): Promise<unknown> {
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
`;
for (const [path, content] of [['packages/contracts/access-generated.ts', ts], ['apps/mobile/lib/generated/access.dart', dart]]) {
  const target = new URL(path, root);
  if (process.argv.includes('--check')) { if (await readFile(target, 'utf8') !== content) throw new Error(`Generated client drift: ${path}`); }
  else { await mkdir(new URL('./', target), {recursive:true}); await writeFile(target, content); }
}
