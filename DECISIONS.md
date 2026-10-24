# Decisions

- ADR-001 proposed: modular TypeScript monolith + PostgreSQL/PostGIS; avoid premature distributed transactions.
- ADR-002 proposed: Flutter native clients + Next SSR website/dashboard routes; avoid Flutter Web for SEO.
- ADR-003 accepted scope invariant: independent stamp/star/tier journals; no mutable reward counters as source of truth.
- ADR-004 proposed: Postgres jobs/outbox initially; Redis only on evidence.
- ADR-005 local implementation: dependency-free Node 24 TypeScript connectivity probe because npm/Flutter/Docker are absent in PATH. This does not satisfy M1 framework/native build gates.
- ADR-006 publication gate: no provider purchases, account registration, production deployment, large imports, outreach or campaigns without approval.
- ADR-007 implemented increment: bundled pnpm found; NestJS 11.1.17 and Next.js 16.4.2 with a lockfile. Nest 12.2.0 was rejected by package age verification and replaced, not allowlisted. Only required esbuild/sharp/unrs build scripts are allowed; telemetry-oriented Scarf and Nest postinstall scripts are denied.
- ADR-008 auth behavior: legacy dashboard/admin/agent shells deny all. Explicit scoped café/session routes authenticate real opaque sessions with restricted runtime roles and transaction-local RLS. Initial public login/provider composition remains closed. No demo token, bypass login or fake OTP.
- ADR-009 local installation recovery: official Next/SWC tarballs obtained with resumable curl, SHA512 matched against lockfile, served through temporary loopback cache to pnpm. Cache is ignored local tooling, never a production registry or committed dependency.
- ADR-010 implemented: atomic internal OTP/identity/audit/session composition; durable private lookup key is separate from OTP HMAC and authenticated encryption key ring.
- ADR-011 implemented: runtime logins must be non-owner/non-inheriting/NOBYPASSRLS; services SET LOCAL role/actor. No phone verification grants café ownership.
- ADR-012 implemented development retention: fixed bounded cleanup of OTP-only data older than 24h; no arbitrary identity-role DELETE and no user/session/audit retention change.
- ADR-013 implemented: official pinned native source checked into Git; CI builds it directly, debug/simulator only. Release signing remains unconfigured.
- ADR-014 activation boundary: next real-login integration requires founder-selected approved SMS provider/template/account and separate real-send authorization. Credentials go only into secure configuration. Web cookie/CSRF and mobile secure storage are part of that real integration, never a mock login.

Founder confirmed repository: https://github.com/hajiheidari/ghavehto. Public café contact numbers are within the authorized directory scope and are not treated as a legal blocker. Record provenance and support correction/removal; private consumer numbers remain protected. This decision does not waive store enrollment or provider requirements.

Founder decisions pending: real legal publishing entity and support confirmation; permitted data sources; SMS/maps/hosting quotes; reward funding and tier policies; retention/privacy legal review. Defaults remain disabled where approval is required.
