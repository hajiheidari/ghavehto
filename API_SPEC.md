# API specification

Nest binds loopback (4101). Swagger/OpenAPI is at /docs and /docs-json. This is a development API, without an initial public login or sending provider.

| Method / path | Behavior |
|---|---|
| GET /health/live | Process liveness only |
| GET /health/ready | Restricted runtime DB plus all known migration checksums; otherwise 503 |
| GET /v1/bootstrap | Validated Persian RTL development/empty bootstrap; loyalty disabled |
| GET /v1/session | Authenticated user/session UUIDs only |
| POST /v1/session/refresh | Strict {refreshToken}; rotates existing opaque credentials (201), invalid/reuse 401 |
| POST /v1/session/logout | Access bearer; idempotent {revoked:true} (201) |
| GET /v1/cafes/:cafeId/access | Membership-scoped café ID/name |
| GET /v1/cafes/:cafeId/branches/:branchId/access | Branch-scoped IDs/name |
| PATCH /v1/cafes/:cafeId/profile | Strict {name}, owner-only, atomic audit |
| GET /v1/dashboards/cafe, /admin, /agents | Legacy shells remain 401 for every caller |

Bearer tokens are random opaque credentials, not submitted actor/role IDs. Tenant operations authenticate, lock session/identity state, check wall-clock expiry, set the server-derived actor locally and switch to café RLS. Missing/invalid credentials yield 401; inaccessible café/branch data yields 404. Unknown body fields and invalid bounded names are rejected. Phone possession does not grant café ownership.

Authenticated responses and errors are no-store. Refresh replay revokes descendants; duplicate logout/replay does not duplicate audit transitions. Clients must serialize refresh. No cookies are accepted as API authority; future web-cookie integration must include CSRF controls. TS lifecycle helpers omit cookies and reject redirects; Dart lifecycle helpers disable redirects and bound the full request/body read. No token is stored in localStorage or a repository default.

Every request receives a server-generated X-Request-ID. Errors are flat {code,message,requestId}, with generic Persian text and no raw exception/SQL/credential details. The OpenAPI error schema and reviewed flat response schemas are exported. The custom generator supports only reviewed flat bootstrap/access/session responses; nested business APIs need explicit generator work.

IDENTITY_DATABASE_URL must point to a distinct non-owner NOINHERIT/NOBYPASSRLS/NOSUPERUSER/NOCREATEDB/NOCREATEROLE login with non-inheriting SET ROLE membership in ghahvehto_identity and ghahvehto_app. Privileged, inherited or table-owner credentials are rejected at startup. Without that pool, authenticated routes deny access and readiness is 503. DATABASE_URL is for migration/tests, never runtime health queries.

The historical dependency-free probe at 4100 is read-only diagnostics and is not the Nest identity backend.

## Public directory discovery

Owner-only staff administration: `PUT /v1/cafes/:cafeId/branches/:branchId/staff/:userId` accepts `{enabled: boolean}` and returns the resulting state. The user ID is for an existing account; granting requires a verified phone. Revoking affects only the staff membership at the specified branch. The route cannot assign owner or manager roles, and does not send invitations.

Ownership intake uses `POST /v1/ownership-claims` with `{branchId}`, `GET /v1/ownership-claims` for the actor's latest 50 requests, and `DELETE /v1/ownership-claims/:id` to withdraw a pending request. All require a valid access bearer. Duplicate open requests for the same café return the same ID. The API accepts only a published branch and grants no ownership, staff access or public partner status. Missing, unpublished or other-user records are not disclosed. Intake is limited per verified actor.

`GET /v1/directory/branches/:id` returns one item from the same reviewed projection. A missing, withdrawn or otherwise unpublished branch returns 404. Invalid UUIDs return 400 and an unavailable runtime database returns 503. Responses are not cached.

`GET /v1/directory?q=<text>&page=<1–100>` returns `{items,hasMore}`. Each item has `id` (branch UUID), `cafeName`, `branchName`, `province`, `city`, and `neighborhood`. Search is optional, literal and capped at 80 characters; page size is 24. Results contain only reviewed branch snapshots with permitted provenance, never private contacts or unreviewed tenant data. Returns 400 for invalid query and 503 when the restricted database is unavailable; an empty published result is 200. Responses are not cached. This early directory contract is consumed by web SSR; mobile binding follows after the directory contract is stable.
