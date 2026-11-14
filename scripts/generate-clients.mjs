import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const document = JSON.parse(await readFile(new URL('packages/contracts/openapi.json', root), 'utf8'));
const schema = document.components.schemas.BootstrapDto;
if (!schema || !schema.required || Object.keys(schema.properties).some(key => !schema.required.includes(key))) {
  throw new Error('Generator currently supports required, flat bootstrap properties only');
}
const fields = Object.entries(schema.properties);
for (const [, field] of fields) {
  if (!['string','boolean'].includes(field.type)) throw new Error('Unsupported schema type; extend generator explicitly');
}
const tsType = field => field.enum ? field.enum.map(value => JSON.stringify(value)).join(' | ') : field.type;
const dartType = field => field.type === 'boolean' ? 'bool' : 'String';
const tsCheck = (key, field) => `typeof value.${key} !== '${field.type}'${field.enum ? ` || !${JSON.stringify(field.enum)}.includes(value.${key} as never)` : ''}`;
const ts = `// Generated from packages/contracts/openapi.json. Do not edit.\nexport interface BootstrapResponse {\n${fields.map(([key,f]) => `  ${key}: ${tsType(f)};`).join('\n')}\n}\nexport function parseBootstrap(input: unknown): BootstrapResponse {\n  if (!input || typeof input !== 'object') throw new Error('Invalid bootstrap');\n  const value = input as Record<string, unknown>;\n${fields.map(([key,f]) => `  if (${tsCheck(key,f)}) throw new Error('Invalid ${key}');`).join('\n')}\n  return value as unknown as BootstrapResponse;\n}\nexport async function fetchBootstrap(baseUrl: string, request: typeof fetch = fetch): Promise<BootstrapResponse> {\n  const response = await request(new URL('/v1/bootstrap', baseUrl), { signal: AbortSignal.timeout(3000), cache: 'no-store' });\n  if (!response.ok) throw new Error('API unavailable');\n  return parseBootstrap(await response.json());\n}\n`;
const dart = `// Generated from packages/contracts/openapi.json. Do not edit.\nclass BootstrapResponse {\n${fields.map(([key,f])=>`  final ${dartType(f)} ${key};`).join('\n')}\n  const BootstrapResponse({${fields.map(([key])=>`required this.${key}`).join(', ')}});\n  factory BootstrapResponse.fromJson(Map<String, dynamic> value) {\n${fields.map(([key,f])=>`    if (value['${key}'] is! ${dartType(f)}${f.enum ? ` || !${JSON.stringify(f.enum)}.contains(value['${key}'])` : ''}) throw const FormatException('Invalid ${key}');`).join('\n')}\n    return BootstrapResponse(${fields.map(([key,f])=>`${key}: value['${key}'] as ${dartType(f)}`).join(', ')});\n  }\n}\n`;
const outputs = [['packages/contracts/generated.ts',ts], ['apps/mobile/lib/generated/bootstrap.dart',dart]];
for (const [path, content] of outputs) {
  const target = new URL(path,root);
  if (process.argv.includes('--check')) {
    if (await readFile(target,'utf8') !== content) throw new Error(`Generated client drift: ${path}`);
  } else { await mkdir(new URL('./',target), { recursive:true }); await writeFile(target,content); }
}
await import('./generate-access-clients.mjs');
