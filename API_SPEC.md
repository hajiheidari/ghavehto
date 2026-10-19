# API specification

Implemented read-only local probe: GET /health → 200 `{status:"ok"}`; GET /v1/bootstrap → 200 contract in packages/contracts/bootstrap.ts. Unknown routes return 404 JSON; unsupported methods return 405 with Allow: GET. No cookies, business writes or CORS wildcard. GET / serves a static Persian RTL connectivity harness.

Bootstrap reports `environment: development`, `dataMode: empty`, `loyaltyEnabled: false`; empty directory is not seeded commercial data. Process health deliberately makes no persistence claim.

M1 must introduce versioned OpenAPI, generated clients, uniform error/request IDs, schema validation, pagination and contract drift CI before adding business APIs. Suggested domains are documented in ARCHITECTURE.md; they are not live endpoints.
