# Development status · 2026-11-18

## Private campaign reservation form · 2026-11-18

The private participation page can render a reservation form when supplied experience, branch and version parameters and an HTTPS PANEL_WRITE_ORIGIN. Same-origin POST uses the existing session-backed API, then redirects to receipt recovery by operation UUID. Public discovery and login remain closed. Next: campaign-specific offer presentation and consent/touch retention policy.

## Persian participation receipts · 2026-11-18

An opt-in Persian RTL receipt page at /dashboard/participation reads the existing member-scoped API using a server-side verified bearer from the access cookie. It displays reserved, cancelled or fulfilled status. PRIVATE_PARTICIPATION_VIEW=1 is required and the API must be explicitly composed. No cookie issuance, public navigation or new writes are enabled. Next: consent/touch retention policy and campaign-specific participation UI.

## Private campaign participation API · 2026-11-18

Migration 066 adds opt-in private participation HTTP for reservation, receipt recovery, cancellation and staff fulfillment. A separate restricted login invokes four session-derived functions. Receipt status is member-scoped and types of resolution retain their existing database authorization. Default startup remains closed. Next: Persian participation presentation and consent/touch retention policy.

## Private experience fulfillment · 2026-11-18

Migration 065 adds immutable private fulfillment receipts with verified cafe ownership, branch-scoped staff authority, exact retry and audit. Cancellation and fulfillment serialize on the existing member/cafe lock. Recovery now reports fulfilled where applicable. This is a maintenance-only record of delivery; no payout, provider, public transport or loyalty movement is enabled. Next: reviewed campaign-specific transport and participation presentation, plus consent/touch retention policy.

## Consented registration handoff · 2026-11-18

Migration 064 requires a stored landing consent receipt for optional attribution during new verification. The explicitly composed JSON landing returns registrationTracking with trackingCode and trackingTouchId after consent, or null after refusal. A future same-origin registration client can send these optional fields in its verification body. No public UI, redirect, persistent client storage or initial-login activation was added. Next: campaign-specific private participation fulfillment and the consent/touch retention policy.

## Private draft submissions · 2026-11-18

Migration 063 connects explicit private HTTP submission to the existing research/content queue. A live operator or admin can submit supplied text and source-rights evidence. Identical retries are bound to the submitting identity; changed payloads, other actors and pre-existing maintenance operations cannot reuse the same operation ID. The worker still stops at human review. Next: reviewed tracking handoff to the registration client, with its activation gates closed.

## Private CMS document creation · 2026-11-18

Migration 062 adds audited document creation through explicitly composed private editorial HTTP. An editor supplies a document UUID and slug. Concurrent exact retries by that editor return the same ID. The private workflow can now create a document and submit its first revision without direct database provisioning. Next: bounded private research/content submission, then reviewed client handoff. Consent/touch retention policy and production activation approvals remain open.

## Tracking quota retention · 2026-11-18

Migration 061 adds maintenance-only cleanup for expired tracking quota fingerprints. Run SELECT public.prune_expired_tracking_buckets() with the migration owner to remove up to 1000 expired rows per call. Consent/touch retention, reviewed registration/client handoff and campaign-specific fulfillment remain open. No scheduler or public tracking activation is registered.

## Private operations administration · 2026-11-18

Migration 060 lets a verified internal admin delegate editor/operator roles and configure research/content pause and attempt limits. Actual changes log the session actor and reason. Admin provisioning remains maintenance-only. Next independent increment: bounded retention for tracking data before reviewed registration/client handoff.

## Private review subjects · 2026-11-18

Migration 059 adds opt-in single-subject GET routes. Editors can read CMS revisions and admins can read completed agent drafts awaiting review. Responses bind the returned payload to its canonical hash and use no-store. Next, add audited internal role and control administration. The prior private-write head b4e592a passed Foundation CI 44296822890 and both probes.

## Private editorial writes · 2026-11-18

Migration 058 and the opt-in Nest composition add private CMS revision and editorial review writes. PostgreSQL derives the actor from the bearer hash and checks live session and role in the write transaction. The dedicated login has only two entry points. The default server does not register these routes. Documents still need maintenance provisioning. Next, add role-scoped private reads and audited role/control administration. Public activation gates remain closed.


## M5 restricted one-shot draft worker · 2026-11-15

Migration 057 gives a dedicated NOINHERIT worker login only three narrow draft lease/finish/fail wrappers. The deterministic runner accepts supplied research/content text and source-rights attestations and creates a private human-review packet; it performs no HTTP fetch, model call, ingestion, outreach, sending, publication, approval or spending. External agent kinds are refused. Invalid input is dead-lettered with a sanitized code; no source text or credentials are logged. Separate runtime validation rejects owner/privileged/identity/app/tracking logins. There is no daemon, schedule or seeded control/job.

The compiled CLI was executed against an actual disposable restricted login: supplied input reached awaiting_review, invalid rights became invalid_input/dead, the empty queue returned idle and outreach was refused. Dedicated-role tests confirm it cannot read identity/job tables, enqueue, approve or invoke unrestricted leases. All 77 compiled API/database tests passed on official Node 24.19.0 against disposable PostgreSQL/PostGIS, zero failures/skips; workspace build/typecheck passed on host Node 24.22.1. The previous CMS code `1c805eb` separately passed Foundation CI 43756689431. This worker change requires its own exact-head CI result.

Manual startup from the existing `/workspace/ghavehto` checkout: supply AGENT_WORKER_DATABASE_URL securely for a separately provisioned NOINHERIT login granted only ghahvehto_worker, then run `pnpm --filter @ghahvehto/api agents:draft-once research` (or content). Do not use migration/runtime identity credentials. Controls must be configured/resumed explicitly by an authorized internal operator; otherwise the runner returns idle. No worktree is needed. Do not auto-enqueue production data or enable a scheduler/provider to test startup. The package alias points to the same source as the executed compiled CLI; no daemon/startup activation is saved.

Continuation checkpoint: reread PR #1 current head/CI on codex/m1-foundation; implement session-derived private reviewer/CMS transport and audited internal role/control administration next, using actual verified sessions and narrow scoped routines. Source/consent/suppression review, client handoff/retention and campaign-specific UI/fulfillment remain independent work. M3/M4/M5 are incomplete. All default public authentication/tracking, SMS, real budgets/rewards, publishing and store-release gates remain closed. No main change or merge.


## M5 immutable CMS drafts and expiring reviews · 2026-11-15

Migration 056 adds explicit internal admin/editor/operator assignments (none seeded), original-content revisions with bounded source-rights evidence, optimistic parent revisions and immutable review receipts. Verified internal editors create private drafts; another authorized editor/admin reviews content. Agent drafts require an internal admin. Approvals bind canonical hashes of the exact request/output or content/source revision, have bounded expiry and cannot be extended by replay or override an existing decision. Revoked reviewer access, pause, changed expected hash and superseding content invalidate usability. Completed agent requests/results and content/review history cannot be rewritten. Source material remains untrusted data; no function executes it.

All new routines remain maintenance-only with no app/identity/tracking grant, no publication or external-effect executor, and zero agent cost. A review receipt is evidence only, not authorization to activate a provider. CMS source-rights metadata is a submitted attestation requiring human review, not proof of externally verified permission or a copied-article import. There is no public CMS/editor UI yet. M5 is incomplete.

Final local validation of this increment: a newly initialized official PostgreSQL 17/PostGIS 3.5 cluster, initially without application roles/data, passed all 76 compiled API/database tests on exact official Node 24.19.0, zero failures/skips. The disposable cluster is not a product seed. New checks include concurrent CMS edits, source-rights rejection, independent-review authority, supersession/revocation, payload tamper refusal, approval expiry/replay/rejection, runtime denial and zero external effects. Initial migration name-resolution and JSON-array fixture serialization failures were corrected before this successful run. Host Node 24.22.1 build/typecheck, 12 unit tests, 1 probe, 3 contracts, OpenAPI/no-diff, client drift, real SSR smoke and production dependency audit passed; the audit reports no known vulnerabilities. No new local native, physical-device or visual-browser result is claimed.

Separate observed remote results: registration `4b9c3aa` / Foundation 43754919858 Success; landing `b10c525` / 43755394438 Cancelled; recovery `d9a913a` / 43755659274 Success; leases `442a523` / 43756009113 Success. This increment's CI must be read from its own head in PR #1; none of those earlier results establishes it.

Precise continuation: stay on `codex/m1-foundation` / PR #1, reread current head and CI, then implement a restricted internal worker adapter/runner and role-scoped private review/CMS transport with no external provider execution. Add tracking retention/cleanup and reviewed registration/client handoff before any public route/link activation. Campaign-specific participation UI/fulfillment and remaining M3/M4 policy work remain open. Do not reopen public OTP/SMS or introduce real budgets, data, sending, payouts, store submission or publication. Use the existing checkout; do not create a worktree or touch main.


## M5 internal leased draft queue · 2026-11-15

Migration 055 introduces four independent agent controls (discovery/research/content/outreach), unconfigured and paused by default, and maintenance-only zero-cost jobs. Exact enqueue retries preserve the same request; conflicting operation reuse fails. SKIP LOCKED leasing, random fencing tokens, post-lock expiry/worker checks, heartbeat, pause checks on transitions, bounded exponential retry and dead-letter handling are implemented. Completion stops at awaiting_review: there is no executing/succeeded provider state, adapter, scheduler, model call, sending, publication or spending path. No business/agent configuration is seeded and no runtime role receives agent access. This is infrastructure, not completed M5 agents.

Validation: 5 real PostgreSQL/PostGIS tests passed on official Node 24.19.0 with no failures/skips, including competing workers, stale tokens, pause during an active lease, replay, SKIP LOCKED, backoff/attempt exhaustion, expired final leases, zero cost and ordinary-runtime denials. Test compilation/API typecheck passed. The suite is included in test:db/CI. Prior tracking head b10c525 CI 43755394438 was Cancelled after a subsequent push; it is not a passed result.

Next independent M5 work: immutable CMS revisions and payload-bound, expiring approvals with actual internal role checks; no provider execution or public publication. Preserve all public identity/SMS/reward/launch gates.


## Internal experience participation recovery · 2026-11-15

Migration 054 adds maintenance-only operation-based receipt recovery and atomic cancellation of an internal experience reservation. Cancellation restores exactly one stock unit and the claim's original version budget once, with immutable reasoned receipt/audit and matching claim lock order. Deactivation does not prevent recovery; foreign/deleted users, competing cancellations, changed requests and over-funded projections are refused. No fulfillment, external payout or runtime/public grant exists.

Cancellation preserves historical participation, first-recorded-visit evidence and member limits; it does not promise renewed eligibility or erase a recorded visit. Recovering an old operation returns reserved/cancelled status without allocating again. Changing that conservative eligibility policy requires separate product work before public use.

Validation: 10 selected PostgreSQL/PostGIS tests passed on official Node 24.19.0, zero failures/skips, including current owner-preview HTTP, cancellation concurrency, replay, first-visit preservation, foreign-user/runtime denial, original-claim replay and full rollback on capacity overflow. TypeScript test compilation passed. Continue independent M5 internal leases, approval integrity and CMS drafts; public tracking/identity/SMS/real budgets/payouts remain disabled.


## Internal consent landing and shared tracking limits · 2026-11-15

Migration 053 introduces a separate restricted tracking capability. Explicit composition with a private HMAC key, HTTPS public origin and non-inheriting runtime login exposes `/q/:code`; standard startup still returns 404. GET is Persian RTL/noindex/no-store and has no persistence. Form/JSON POST requires same-origin explicit consent; rejection has no storage effects. No cookies, store redirects, login, SMS or link activation are introduced. Tracking fingerprints canonical transport IPs with a separate domain-derived HMAC, ignores forwarded IPs and never stores raw addresses. Scan and store-click remain separate facts, with no inferred installations or visits.

A database quota of 30 accepted/unavailable-link attempts per visitor/hour is shared across links, kinds, service replicas/restarts. Exact retries preserve their receipt without charging twice; changed operations conflict. Unknown/inactive links consume the quota, concurrent requests cannot exceed it, 429 includes Retry-After and old windows reopen. Consent policy version 1 is recorded separately. This is internal opt-in infrastructure, not approval to activate public tracking. Public deployment still needs retention/cleanup, ingress/global abuse review and reviewed store/client handoff; the form deliberately says login/download are unavailable.

Validation: workspace build/typecheck passed; 9 selected real PostgreSQL/HTTP/default-startup tests passed on official Node 24.19.0 with zero failures/skips, including form acceptance/rejection, Origin rejection, no-write GET, quota concurrency/restart/cross-link checks and restricted-role denials. Prior registration commit `4b9c3aa` separately passed Foundation CI 43754919858, observed on its GitHub run page; this new code requires its own result.

Continue independent internal experience recovery, then M5 worker leases, approval integrity and CMS drafts. M3/M4 remain incomplete; all external activation restrictions remain.


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
