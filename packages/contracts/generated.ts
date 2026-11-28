// Generated from packages/contracts/openapi.json. Do not edit.
export interface BootstrapResponse {
  brand: string;
  locale: "fa-IR";
  direction: "rtl";
  environment: "development";
  dataMode: "empty";
  loyaltyEnabled: false;
}
export function parseBootstrap(input: unknown): BootstrapResponse {
  if (!input || typeof input !== 'object') throw new Error('Invalid bootstrap');
  const value = input as Record<string, unknown>;
  if (typeof value.brand !== 'string') throw new Error('Invalid brand');
  if (typeof value.locale !== 'string' || !["fa-IR"].includes(value.locale as never)) throw new Error('Invalid locale');
  if (typeof value.direction !== 'string' || !["rtl"].includes(value.direction as never)) throw new Error('Invalid direction');
  if (typeof value.environment !== 'string' || !["development"].includes(value.environment as never)) throw new Error('Invalid environment');
  if (typeof value.dataMode !== 'string' || !["empty"].includes(value.dataMode as never)) throw new Error('Invalid dataMode');
  if (typeof value.loyaltyEnabled !== 'boolean' || ![false].includes(value.loyaltyEnabled as never)) throw new Error('Invalid loyaltyEnabled');
  return value as unknown as BootstrapResponse;
}
export async function fetchBootstrap(baseUrl: string, request: typeof fetch = fetch): Promise<BootstrapResponse> {
  const response = await request(new URL('/v1/bootstrap', baseUrl), { signal: AbortSignal.timeout(3000), cache: 'no-store' });
  if (!response.ok) throw new Error('API unavailable');
  return parseBootstrap(await response.json());
}
