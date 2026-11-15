# Development status · 2026-11-15

## Verified registration attribution · 2026-11-15

Migration 052 attaches cafe tracking only on INSERT of a new verified identity. The optional code must hash to the recorded touch's link; live link/cafe/ownership/experience and attribution window are checked. Invalid, unknown, inactive, expired or mismatched optional evidence is ignored. Returning accounts cannot gain a registration fact. OTP consumption, identity, tracking facts/audit and session issuance share the original transaction; unexpected storage failures still abort it. No broad tracking grants were added. Explicitly composed login accepts optional tracking fields and ignores unusable acquisition metadata; default login routes and SMS remain disabled.

Observed before editing: PR #1 is Draft at `0bbb753420df09b4b63e1b640dfa001c5dea1a16`; Foundation run 43649473468 for that documentation head and run 43648754783 for `5b2998a` both show Success on GitHub's web pages. API/GraphQL returned Forbidden, so web pages and Git refs were used. No new-code CI result is implied.

Local validation: frozen install/supply-chain checks, build, typecheck, 12 unit tests, 1 probe, 3 contract tests, generated-client drift, OpenAPI/no-diff and real SSR smoke passed on host Node 24.22.1. All 54 database tests passed on exact Node 24.19.0 (official image) against newly created PostgreSQL 17/PostGIS 3.5, zero failures/skips. Tracking tests cover concurrent verification, one-time attribution, returning accounts, rollback after session insertion, malformed/mismatched/stale/expired/inactive evidence; HTTP tests verify malformed optional metadata does not invalidate a genuine proof. Synthetic fixtures remain disposable.

Next: consent and rate-limited landing flow before tracking activation; participation recovery and independent M5 leases/approvals/CMS. M3/M4 remain incomplete. No public login, SMS, real budget, publication or payout enabled.


M0 planning is documented. M1 production identity activation is deferred at the founder's direction while independent M2 work proceeds. See [product delivery sequence](docs/PRODUCT_EXECUTION.md). No production launch or completed end-user login is claimed.

Source of truth: https://github.com/hajiheidari/ghavehto, branch `codex/m1-foundation`, draft PR #1. Main has not been changed. [Live PR checks](https://github.com/hajiheidari/ghavehto/pull/1/checks) are authoritative for the current head.

## Observed execution

Code `495eaba5e112211d43d89585564ed986ae4f87c2` passed [Foundation CI 40142933728](https://github.com/hajiheidari/ghavehto/actions/runs/40142933728) in all five jobs: web/API/database, mobile source/integration, complete cloud development container, checked-in Android debug and checked-in iOS simulator debug. Logs confirmed 17 PostgreSQL tests including parent-suite accounting and 6 Flutter tests, with Flutter analyze reporting no issues. Local unit/type/contract/drift/build/SSR checks also ran successfully as recorded in TESTING.md.

The subsequent Persian HTTP error/request-ID checkpoint `34221b1` passed all five jobs in Foundation CI 40143606737. The lock capture checkpoint `a2ba5bd` also passed all five jobs in CI 40143950028. Dart dependencies are now checked in and enforced alongside the pinned pnpm lock. See live PR checks for the enforcing commit's separate results.

## Implemented M1 foundations

- Pinned Node 24.19.0 / pnpm 11.25.0 / Nest 11.1.18 / Next 16.4.2 / Flutter 3.47.5, frozen lockfile, package-age verification and explicit build-script allowlist.
- Persian RTL Next SSR connected to the real Nest bootstrap; honest empty/error states and protected dashboard shells. No imported commercial directory data.
- PostgreSQL/PostGIS migrations 001–007, tenant/branch RLS, checksum-verified migrations and readiness through restricted credentials.
- Persistent OTP HMACs, expiry, attempt/send budgets, cooldown, single-use consumption, resend supersession, provider cancellation/deadline and bounded expiry maintenance.
- Atomic internal OTP → encrypted phone identity → audit → opaque session issuance; stable private lookup HMAC and authenticated encryption key ring. No automatic café/admin role grant.
- Restricted identity and café roles, non-inheriting non-owner runtime login validation, transaction-local session-derived actor context.
- Authenticated café/branch reads and owner-only profile updates with atomic audit; session status, rotation and idempotent logout. Admin/agent and legacy dashboard routes still deny access.
- OpenAPI-derived validated flat TypeScript/Dart bootstrap/access/session models and narrow client helpers, with drift checks.
- Android/iOS platform sources checked into Git from checksum-verified official pinned templates; CI builds those files directly. Native names are Persian; Android HTTP exception is debug-only; release signing is unset.

## Current activation boundary

Initial public OTP/login routes and SMS delivery are NOT enabled. The only enabled delivery implementation in application defaults is the disabled adapter; capturing providers and synthetic identities exist solely in disposable tests. No fixed OTP, bypass/demo token or consumer PII seed exists.

The founder selected SMS.ir. Its Verify Send adapter is implemented and tested with an injected offline transport; it is not wired to startup. Genuine sign-in still needs an existing account and approved template, secure credentials (never chat/Git), and separate authorization for a narrowly scoped real test send.

Initial login HTTP handlers are available only to explicitly composed apps; the standard executable does not register them. Next: review the approved template, compose secret/key configuration, add web HttpOnly/Secure/SameSite cookies with CSRF protection and mobile secure token storage, then verify the real-device flow. Public deployment still requires separate approval, TLS/ingress abuse controls and operational review.

## Verified execution checkpoint · 2026-11-15

Exact executable code `5b2998ac03b33681ed065bec7822324052db56b0` passed Foundation CI [43648754783](https://github.com/hajiheidari/ghavehto/actions/runs/43648754783). The complete compiled API/database suite also passed all 65 tests on Node 24.19.0 against a newly initialized PostgreSQL/PostGIS cluster with no existing application roles or data; the disposable cluster was then removed. The production dependency audit reports no known vulnerabilities. This validation update changes documentation only; future executable changes require their own checks.

Resume from PR #1 / `codex/m1-foundation`, never main. Next concrete code work is trusted new-registration tracking integration in the verified identity transaction (new accounts only, optional unusable attribution must not break sign-in), then consent/rate-limited landing behavior before link activation. Keep OTP/SMS startup disabled. Add campaign-specific participation recovery/client flows and independent M5 worker lease/approval/CMS work from ROADMAP. M3/M4 are still incomplete; no real budgets, café data, public campaign, provider, payout or release was enabled.

## Dependency security checkpoint · 2026-11-15

The owner-preview code `1ed5c1016b96e280594b161ed43998c363172f6c` passed Foundation CI [43647945317](https://github.com/hajiheidari/ghavehto/actions/runs/43647945317). It also passed all 65 compiled API/database tests on the exact Node 24.19.0 image, with zero failures/skips.

A production dependency audit then reported 11 advisories (6 high, 4 moderate, 1 low) in previously pinned dependencies. Nest common/core/platform-express are now pinned to the compatible 11.1.18 patch; targeted same-major overrides select path-to-regexp 8.4.2, multer 2.5.0, body-parser 2.4.0 and js-yaml 5.4.1 for affected ranges. A repeat production audit reports no known vulnerabilities. Frozen lock/supply-chain checks, build/typecheck, generated contract export/no-diff/drift, SSR smoke, 3 contract tests, 12 API unit tests and 1 probe passed. All 65 compiled tests, including 53 database tests, passed again on Node 24.19.0 after the security patches. Foundation CI now enforces production audit at high severity; this patch needs its own exact-head remote result, never inferred from the earlier CI.

Continue from the pushed PR #1 head with the next-work list below. Core services stay free, all commercial data/budgets remain unseeded and SMS/public launch/real payouts remain disabled. Local Flutter/container completion still needs the already-saved environment network change; independent product work must continue while it is pending.

## M4 private owner experience preview · 2026-11-15

Migration 051 adds a narrow owner-only policy/capacity read, optional experience titles and bounded UUID pagination. The Nest GET `/v1/cafes/:cafeId/experiences` derives identity from an actual verified session through the restricted runtime login and returns no participant contacts or raw claims. Staff, consumers, unrelated café owners and revoked owners cannot read it. Budget units remain decimal strings through JSON and render via BigInt without precision loss. The Persian RTL owner panel now shows latest configured policy, branch, dates, limits, stock and internal budget, with honest signed-out/denied/empty states and no write/activation/payment controls. OpenAPI documents the response; mobile DTO/client integration for this new read is still pending.

Default-startup profile reading also now evaluates the missing-runtime/auth guard before dereferencing the absent service, returning 401 consistently. Public login and all SMS remain disabled. Workspace build/typecheck, 12 API unit tests, 1 probe, 3 contracts/client drift and SSR smoke passed; full PostgreSQL/PostGIS suite passed 53 tests with zero failures/skips, including real Next→Nest owner preview on disposable restricted credentials. Browser visual QA is not implied.

Next bounded work: read exact PR head/CI first; complete trusted new-registration tracking integration and public landing/consent/rate-limits before any tracking activation; add campaign-specific participation recovery and founder/client flows; then independent M5 worker leases/approval/CMS foundations per ROADMAP. Do not treat M3/M4 as complete, seed real budgets/data or enable providers. Later fraud clawback, expired/mixed-lot recovery and real reward fulfillment remain separate policy/activation gates.

## M4 printable inactive tracking QR · 2026-11-15

Migration 050 and the internal `prepareCafeTrackingQr` helper create printable Persian RTL HTML with an embedded 960px PNG QR and its exact HTTPS URL. Rendering completes before persistence; only the random 256-bit code hash is stored. An explicit HTTPS origin, scope and bounded lifetime/window are required. The database requires verified ownership and always creates an inactive link. No landing route, activation, printing service, public QR publication, external request or inferred install is enabled. A printed draft is not an operational public link until the separate landing and activation work is done.

Full PostgreSQL/PostGIS suite passed 52 tests, zero failures/skips; 12 API unit tests (including independent PNG/QR decoding), 1 probe test, frozen install/supply-chain verification, workspace build and typecheck passed. qrcode 1.5.4 and test-only decoder/parser types are pinned in the lockfile. Continue the private owner experience preview before public campaign/attribution activation.

## M4 private café attribution evidence · 2026-11-15

Migration 049 stores hash-only scoped café/branch/optional-experience links (inactive by default), immutable QR-scan/store-click touches, distinct registration and phone-verification facts, and confirmed QR interaction attribution. Link scope/window cannot be rewritten. New touches require live verified ownership and an active unexpired link; callers cannot provide touch timestamps or assert installs/verification through that path. Registration attribution derives its times from a newly verified account within the configured touch window and cannot overwrite another touch. Genuine interaction requires the attributed member's consumed QR in the same branch within that window. The private report exposes separate counts, never an inferred installation metric. No raw phone/IP/device fingerprint is stored by tracking. No public routing, runtime grant, campaign activation or outreach is enabled.

Full PostgreSQL/PostGIS suite passed 51 tests, zero failures/skips. Integration into trusted new-registration transactions and client landing/consent/rate-limit flows remains pending; these internal routines are not public analytics readiness. Printable inactive tracking QR artifacts are next.

## M4 separate founder cohorts · 2026-11-15

Migration 048 adds independent member/café founder programs with explicit qualification, enrollment and benefit end instants. No default 30-day policy or cohort is seeded; programs default inactive. Member qualification uses verified registration time; café qualification requires an active verified ownership grant and usable owner. Immutable badge events are once per program/subject, replayable and permanent. Time-limited benefit eligibility is calculated separately and stops at its end, program pause, deleted member or lost verified café ownership; these do not erase the badge event. No tier/star/stamp points are touched, no real benefit/provider/public rollout is enabled.

Full PostgreSQL/PostGIS suite passed 46 tests, zero failures/skips. Continue M4 tracked café QR and honest scan/click/verified-registration/interaction distinctions; do not infer installs or real visits from clicks.

## M4 atomic experience participation · 2026-11-15

Migration 047 adds maintenance-only participation claims with immutable replay receipts. Member, verified ownership, branch, policy window, stock and budget are rechecked after locks; the cutoff comes from the database clock. A shared member/café lock enforces first-recorded-participation across campaigns and member limits across policy versions. Claims atomically consume one stock unit, the explicit version budget cost, optional first-visit linkage and one audit event. Exact retries return the original receipt even after deactivation; changed payloads conflict. Confirmed QR history prevents first-recorded-visit participation. No loyalty journal is awarded/spent, and no public/runtime/provider activation is enabled.

Full PostgreSQL/PostGIS suite passed 41 tests, zero failures/skips. Participation is internal reservation only; experience cancellation, campaign-specific fulfillment/UI and public reviewed projections remain later work. Continue independent M4 member/café founder windows next.

## M4 private experience policies · 2026-11-15

Migration 046 starts M4 with disabled-by-default experience definitions, immutable policy versions, branch/date/member limits, per-café version stock and budget envelopes, append-only claims and first-recorded-visit linkage. Maintenance-only eligibility checks require an active café with a live verified ownership grant and owner, verified member, correct branch, half-open UTC window, capacity and per-experience member limits. First-visit eligibility uses recorded QR interactions and participation only; it does not assert absence of off-platform visits. Budget units are explicit internal accounting units, not customer fees or provider payments. No campaign catalog/UI, public offer, runtime write grant, seeds or real spending is enabled.

Full PostgreSQL/PostGIS suite passed 37 tests, zero failures/skips. Atomic participation and concurrent first-visit/stock/budget enforcement are the next bounded M4 increment; the schema alone does not complete the milestone.

## M3 reviewed referral funding · 2026-11-15

Migration 045 adds maintenance-only once-per-attribution star issuance from an explicitly supplied funded budget. The inviter is derived from the immutable verified attribution, both accounts must remain usable, and a terminal eligible review with passing stored-cap screening is required. A consumed stamp QR for the invitee after attribution is required; an interaction awarded by the inviter, a pre-attribution interaction or a reversed award is refused. A dedicated immutable link binds attribution, interaction and funded star entry. Exact replay returns the original entry; a different operation or payload cannot issue twice or appropriate a pre-existing direct award. Insufficient budget rolls back issuance, mapping and audit. No runtime/public function grant, default reward amount, seeded funding or external payout is enabled. Later fraud clawback remains policy work.

Full PostgreSQL/PostGIS suite passed 34 tests with zero failures/skips, including a dedicated real-QR/referral/funding fixture. This is internal accounting, not production reward activation. Continue independent M4 experience policy/eligibility and bounded participation next; public activation remains gated.

## M3 reservation recovery · 2026-11-15

Resume verified branch/PR #1 head `bb836c9be696ab1170378e0088905c49eacfb8ea` and Foundation CI [43639225961](https://github.com/hajiheidari/ghavehto/actions/runs/43639225961) as Success from the GitHub run page. Local changes were absent.

Migration 044 adds maintenance-only atomic reservation cancellation: one immutable cancellation receipt, exact original-lot reversal, one stock return and reasoned audit. A deferred FK requires the corresponding immutable reversal to exist at commit; the reserved-spend guard accepts only its matching cancellation. Same-operation retries return the receipt; competing cancellations cannot restock twice. Cancellation can recover inactive rewards but refuses expired original lots or unknown history. A stock overflow rolls back all cancellation/refund writes. New reservation and cancellation use the same stock-before-account lock order. No public route, runtime grant, delivery or real payout is enabled.

The complete PostgreSQL/PostGIS suite passed 31 tests, zero failures/skips. M3 remains incomplete: expired/mixed-lot recovery policy, delivery/cancellation finalization and referral reward integration are still separate work. Continue independent milestones without activating external providers.

## M3 continuation · 2026-11-14

Re-read PR #1 as Draft and its branch/ref as `a1dc4b42ce7f7442529d6094e7fefd3a2c091910`. The public GitHub page for Foundation CI 43636010467 reports Success for that checkpoint. GitHub API/GraphQL access returned Forbidden; the web page supplied the observed status.

Migration 038 adds maintenance-only star debits and immutable earliest-expiry lot allocations. Per-account serialization prevents different operations from overspending; exact retries return the same entry, and changed payloads conflict. Expiry is checked after acquiring the balance lock. Balance inspection supports allocated spends and historical cutoffs, while unallocated or unsupported history remains unknown. No public route, runtime permission, reward payout or production budget is enabled. Stamp and tier journals remain independent.

Migration 039 adds maintenance-only expiry accounting for the exact unspent remainder of a funded award. It shares the spending account lock, records one immutable linkage and audit event, rejects early or duplicate expiry and does not refund the funding budget. Expiry records do not deduct active balance a second time. No scheduler or runtime grant is enabled.

Migration 040 adds full maintenance-only spend reversals with a reason and immutable linkage. Account serialization and original-lot accounting allow safe re-spending without duplicating credits. A reversal is refused when any original lot has expired; partial or mixed-expiry recovery and award reversals remain separate work. Funding budgets are never refunded by spend reversal. No reward fulfillment, runtime permission or public endpoint is introduced.

Migration 041 adds a maintenance-only read-only star account report: raw journal total, supported spendable balance, expired remainder awaiting accounting and their variance. Unsupported historical records preserve an unknown spendable balance/variance instead of inventing an answer. No automatic repair is performed.

Migration 042 adds maintenance-only star reward stock and permanent reservation receipts. The spend, earliest-expiry allocations, stock decrement, receipt and audit share one transaction; different rewards compete for one balance and different accounts compete for one remaining item. Rewards default inactive and no inventory is seeded. Accounting reversal does not claim cancellation or restock a reservation. No delivery, payout, public endpoint or runtime permission is enabled.

Migration 043 blocks standalone reversal of a spend linked to a reward reservation. Until atomic reservation cancellation exists, credits cannot be restored while the original reservation remains open; failed reversals roll back the journal/audit/linkage. Direct internal spends remain reversible under migration 040's original-lot rules.

## Cloud continuation checkpoint · 2026-11-14

Host frozen installation, build, typecheck, unit/contracts/client drift, SSR/API health/bootstrap and the complete disposable PostgreSQL/PostGIS test suite have run successfully. Local host Node is 24.22.1, pnpm 11.25.0. The repository-pinned complete container is not yet ready locally: after resolving proxy CA trust through BuildKit secret mounts, the Dart SDK download from storage.googleapis.com was denied with CONNECT 403. No TLS/checksum verification was disabled. The environment draft saves host installation/start instructions and the selected working checkout; it adds storage.googleapis.com and api.github.com to the custom network domains, preserving package-manager presets. Draft saving is not publication or evidence of network application.

Exact next work: re-read current PR #1 head/checks; retain migrations 038–043 and run the new star fixture through exact-head CI. After the environment network edit is applied, retry the pinned container, then Flutter analyze/tests and the cloud validator. Next M3 logic is bounded reservation cancellation/recovery tied to accounting reversals, with stock restored at most once and concurrency/idempotency tests; standalone reversal of a reserved spend is blocked by migration 043. Award reversal/refunding policy and mixed-expiry restoration remain unimplemented, and real reward fulfillment remains disabled. Then proceed through independent M4 eligibility/experience/founder/attribution work in ROADMAP; M3 and later milestones are not declared complete.

## Other open gates

Migration 037 lets database maintenance compare issued stars with funded and remaining units. A mismatch is reported without changing the journal or budget.

Migration 036 records one immutable internal referral decision per attribution. Eligibility requires a passing screen and a recorded reason. No payout or public operator route is enabled.

Migration 035 adds a maintenance-only referral review preview with a configurable rolling 24-hour cap. Meeting the cap is not reward approval; no reward is issued.

The opt-in OTP verification handler accepts a referral code. Normal startup still leaves this handler and all SMS delivery disabled.

Migration 034 attaches an optional referral during the verified identity insert. Existing accounts and unusable codes do not receive attribution. The HTTP handler does not accept referral codes yet.

Identity verification now supports a transaction-local callback only for new verified registrations. Referral registration wiring and restricted database access remain pending; no HTTP handler provides the callback.

Migration 033 provides a private expiry-aware funded star balance for award-only accounts. Unsupported historical adjustments return an unknown balance. Maintenance-only lot-backed spending is added in migration 038; runtime spending remains disabled.

Migration 032 adds internal issuance and revocation. It stores only hashes of random codes; public routing and tying attribution to a newly registered account remain pending.

Migration 031 adds hashed referral link storage and atomic verified attribution with one inviter per invitee. There is no public route, registration attachment, risk scoring or reward payout yet.

Migration 030 records internal tier awards and calculates points by qualification year and cutoff. It does not spend points, touch stars, or activate tiers and benefits; runtime access remains disabled.

Migration 029 issues platform stars from a maintenance-provisioned budget with atomic debit, audit and replay handling. No budget is seeded; no runtime grant, public issuance or redemption is enabled.

Migration 028 reconciles full historical spend reversals with fully allocated, still-valid original awards. It restores their lot balance without changing reward stock or the journal. Expired or mixed-validity restores remain blocked. The function remains maintenance-only.

Migration 027 reconciles full negative reversals of unused stamp awards. Linked reversals reduce lot balances and do not block other valid redemptions. Restoring spent or expired units still requires separate rules.

Migration 026 reconciles combined historical expiry entries against an explicit list of expired awards in one scope, requiring the full remainder of each award and an exact total. Reversal reconciliation remains open.

Migration 025 links a documented legacy expiry to a single award in the same account and program if its full unspent remainder matches. Combined expiries, unresolved spending and reversals remain blocked.

Migration 024 records the remaining units of an expired stamp award through a maintenance-only function. Redemption understands linked expiry entries. Unlinked legacy expiry and reversals still need separate reconciliation; no worker or endpoint is enabled.

Migration 023 allows maintenance to attach evidence-backed lot allocations to legacy spends without altering past entries. Histories with reversals or explicit expiry entries still require separate rules.

Migration 022 adds an owner-only diagnostic scoped to one user, café and program version. Its lot totals are raw accounting evidence, not a spendable balance. Mixed historical records remain blocked until reconciled.

Migration 021 allocates stamp debits to valid awards by earliest expiry. Mixed expiring and legacy unallocated/reversal history remains blocked pending reconciliation. Public redemption is still disabled.

Migration 020 implements internal stamp redemption with stock and balance serialization, a permanent receipt and audit. It rejects ledgers with expiring awards until lot accounting is implemented. No redemption route or runtime grant is enabled.

The QR success integration fixture exercises the opt-in HTTP flow from verified sessions through the journal and concurrent duplicate scans. Standard startup still leaves the routes disabled.

An explicitly composed test application can exercise QR issue/consume routes with verified bearer sessions. Normal startup does not register them; no client scanner or rollout is enabled.

Migration 019 wires QR into the verified backend session transaction. The customer and awarding employee are derived server-side. There is still no public QR endpoint or UI.

Migration 018 adds a database-enforced rolling issuance limit across all branches. Public QR routes and verified-session wiring remain pending.

Migration 017 implements internal stamp QR issue/consume with hash-only storage, 90-second expiry and branch binding. No HTTP routes, QR screen or general runtime permissions are enabled; session wiring and issuance throttling remain pending.

Migration 016 adds a restricted internal one-stamp capability, operation replay protection and atomic audit. It is not granted to the web/API runtime. The QR/visit proof, rate limits, expiry and redemption are still pending before activation.

M3 storage starts in migration 015: three independent append-only journals and immutable stamp program versions. Runtime roles cannot access them yet. Transactional earning, balance checks, expiry processing, QR and redemption are pending.

Owners can edit the private café name from the panel when the HTTPS write origin is configured. This does not alter the reviewed public listing.

Staff changes can be submitted from the owner web panel when `PANEL_WRITE_ORIGIN` is configured as an exact HTTPS origin. The default remains read-only. No browser session issuance or real SMS is enabled.

The café panel includes a branch staff roster. Owner authorization remains enforced by the API; no contacts or tokens are rendered.

The read-only café web panel now consumes the authenticated scope APIs. It reads an opaque access credential only from a host-only secure cookie name and validates it with the API on every request. Genuine initial issuance, rotation, logout and CSRF-protected mutations remain activation work.

Authenticated café/branch navigation APIs now return only the actor's accessible scopes. Owner capability is derived on the server. No café ID must be guessed to start navigating.

Owners can read branch staff IDs using a paginated API (migration 014). The roster does not expose account contact details or change the underlying self-only membership policy.

Branch staff administration is available through an owner-only API (migration 013). It requires a known verified user ID; account discovery, invitations and a management UI are not included.

Ownership access now has a separate restricted operator command (migration 012). It cannot replace an existing owner or replay a revoked grant. Operational accounts and reassessment are still pending.

Ownership requests now have a private operator queue and verified/rejected decisions (migration 011). The database stores an opaque reference to a separately reviewed evidence case. Provisioning a reviewer, collecting evidence and granting or revoking operational ownership remain separate.

Claim intake is available to verified sessions against a published branch (migration 010). It is private to the claimant, bounded and audited. Evidence upload, reviewer approval, actual ownership grant and a claimant UI are separate follow-ups.

Public branch detail pages use the same visibility and provenance rules as search. They distinguish a missing listing from a temporarily unavailable directory.

Directory stewardship now has a restricted operator CLI and migration 009. Publish, correct and withdraw decisions are revision-checked and audited atomically. Operator accounts are not provisioned and there is no public or staff HTTP write endpoint yet.

M2 started with a reviewed branch projection (migration 008), bounded public search and an RTL SSR directory. Sources must be permitted; withdrawal and source denial hide records. No public phone, commercial dataset, write UI or claim flow is included yet.

Cloud Browser could not reach the development host's localhost preview (net::ERR_CONNECTION_REFUSED). Browser visual QA is unverified. Android debug and iOS simulator builds are not physical-device or signed-store tests. Publisher/region feasibility, Iranian device reachability, final icons/store assets and operational privacy/restore review remain open.

M2 directory/provenance/claims/search, M3 independent immutable stamps/stars/tier journals, M4 experiences/referrals/founders, M5 agents/content and M6 release hardening remain milestone work. The three loyalty journals stay separate and disabled until implemented and tested. Core consumer/café features remain permanently free.

No public hosting, store submission, purchase, outreach, campaign or bulk third-party import has been performed.
