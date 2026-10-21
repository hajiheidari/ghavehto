# API specification

## Milestone 1 Nest API · loopback 4101

Implemented: GET `/v1/bootstrap` using shared contract; GET `/health/live`; GET `/health/ready` verifies database connectivity and migration presence; `/docs` and `/docs-json` provide Swagger/OpenAPI. GET `/v1/dashboards/cafe`, `/admin`, `/agents` deliberately return 401 for every caller, including forged bearer tokens. No login or privileged data endpoint is enabled. Helmet supplies baseline response headers. No production rate limiting/auth/session flow is claimed.

Generated schema is `packages/contracts/openapi.json`. TypeScript client and Dart DTO come from `scripts/generate-clients.mjs`; CI checks drift. Business schemas, pagination and API error/request-ID standards remain M1 work.

## Historical M0 probe · loopback 4100

Implemented read-only local probe: GET /health → 200 `{status:"ok"}`; GET /v1/bootstrap → 200 contract in packages/contracts/bootstrap.ts. Unknown routes return 404 JSON; unsupported methods return 405 with Allow: GET. No cookies, business writes or CORS wildcard. GET / serves a static Persian RTL connectivity harness.

Bootstrap reports `environment: development`, `dataMode: empty`, `loyaltyEnabled: false`; empty directory is not seeded commercial data. Process health deliberately makes no persistence claim.

M1 must introduce versioned OpenAPI, generated clients, uniform error/request IDs, schema validation, pagination and contract drift CI before adding business APIs. Suggested domains are documented in ARCHITECTURE.md; they are not live endpoints.
