# API specification

Existing session lifecycle: `GET /v1/session` returns only the authenticated user/session UUIDs; `POST /v1/session/refresh` accepts only `{refreshToken}` and returns a rotated pair (201), rejects invalid/reused refresh credentials (401), and invalidates descendants on reuse. `POST /v1/session/logout` uses the access bearer and returns `{revoked:true}` (201) idempotently. Every response is no-store. Repeated logout/replay does not append duplicate revocation audit transitions. There is no initial public login or OTP issuance route. Cookies are not accepted as authority; authenticated TS helpers omit cookies and reject redirects, and Dart lifecycle helpers disable redirects and bound the complete request/body read. Clients must serialize refresh and use platform-secure secret storage before login UI activation.

Readiness now requires the restricted IDENTITY_DATABASE_URL pool and matching checksums for every migration in this application version. `/health/live` only checks process liveness. Missing runtime configuration, unapplied/mismatched migrations or DB failure yield readiness 503. The API never uses DATABASE_URL migration credentials for health checks.

Authenticated café scope increment: `GET /v1/cafes/:cafeId/access`, `GET /v1/cafes/:cafeId/branches/:branchId/access`, and owner-only `PATCH /v1/cafes/:cafeId/profile` (body `{name}` only). Real opaque access bearer tokens are authenticated within the same transaction as RLS-scoped queries; user IDs in headers/body never set tenant context. Invalid tokens return 401; inaccessible records return 404; unknown/invalid body fields return 400. Responses are private/no-store. Profile updates and owner audit append are atomic. No cookies, token issuance/login or SMS route is exposed. Legacy dashboard/admin/agent shells remain deny-all.

Set `IDENTITY_DATABASE_URL` only to a separately provisioned non-owner/NOBYPASSRLS runtime login with SET ROLE membership in `ghahvehto_identity` and `ghahvehto_app`; privileged migration/database-owner credentials are rejected at startup. Without this pool, café scope endpoints return 401. OpenAPI models generate validated TS/Dart access DTOs and TS request helpers; the generator remains deliberately limited to the reviewed flat response schemas. Broader business schemas still require explicit generator work.

## Milestone 1 Nest API · loopback 4101

Implemented: GET `/v1/bootstrap` using shared contract; GET `/health/live`; GET `/health/ready` verifies database connectivity and migration presence; `/docs` and `/docs-json` provide Swagger/OpenAPI. GET `/v1/dashboards/cafe`, `/admin`, `/agents` deliberately return 401 for every caller, including forged bearer tokens. No login or privileged data endpoint is enabled. Helmet supplies baseline response headers. No production rate limiting/auth/session flow is claimed.

Generated schema is `packages/contracts/openapi.json`. TypeScript client and Dart DTO come from `scripts/generate-clients.mjs`; CI checks drift. Business schemas, pagination and API error/request-ID standards remain M1 work.

## Historical M0 probe · loopback 4100

Implemented read-only local probe: GET /health → 200 `{status:"ok"}`; GET /v1/bootstrap → 200 contract in packages/contracts/bootstrap.ts. Unknown routes return 404 JSON; unsupported methods return 405 with Allow: GET. No cookies, business writes or CORS wildcard. GET / serves a static Persian RTL connectivity harness.

Bootstrap reports `environment: development`, `dataMode: empty`, `loyaltyEnabled: false`; empty directory is not seeded commercial data. Process health deliberately makes no persistence claim.

M1 must introduce versioned OpenAPI, generated clients, uniform error/request IDs, schema validation, pagination and contract drift CI before adding business APIs. Suggested domains are documented in ARCHITECTURE.md; they are not live endpoints.
