# Changelog

## Private CMS inventory · 2026-11-21

Add private CMS document inventory for editors with latest revision references and bounded pagination.

## Cafe-bound tracking stop · 2026-11-21

Bind owner panel tracking stops to the cafe in the current route.

## Private owner tracking panel · 2026-11-21

Add private Persian owner tracking inventory and stop forms.

## Private tracking link inventory · 2026-11-20

List private cafe tracking links through verified owner sessions with bounded pagination.

## Star reservation concurrency · 2026-11-20

Fix stock rechecking after a concurrent star reservation cancellation.

## توقف خصوصی پیوند · 2026-11-19

مسیر توقف پیوند به نشست مالک و نقش مستقل متصل شد. آزمون یکپارچه، غیرفعال بودن پیش‌فرض، رد کاربر بی‌مجوز، رد هویت ارسالی و نشست لغوشده را بررسی می‌کند. اجرای PostgreSQL محلی انجام نشده است.

## Tracking link stop · 2026-11-18

Add scoped, audited maintenance stop for a cafe tracking link.

## Tracking retention decision checkpoint · 2026-11-18

Document the decisions and acceptance checks required for tracking retention and deletion.

## In-branch receipt handoff · 2026-11-18

Connect private cafe navigation and member receipt instructions to the staff fulfillment handoff.

## Private participation history · 2026-11-18

List private participation receipts for the authenticated member with bounded pagination.

## Tracking retention inventory · 2026-11-18

Add a maintenance-only aggregate inventory for tracking retention decisions.

## Consent receipt data minimization · 2026-11-18

Minimize tracking consent correlation by deriving the stored replay digest per operation.

## Private staff fulfillment page · 2026-11-18

Add private Persian staff fulfillment handoff with server-checked receipt scope and same-origin recording.

## Private reservation cancellation · 2026-11-18

Add member cancellation to the private Persian receipt with same-origin submission and receipt recovery.

## Private campaign offer preview · 2026-11-18

Show verified private campaign details and availability before rendering the reservation form.

## Private campaign reservation form · 2026-11-18

Add a private Persian campaign reservation form with same-origin enforcement and operation-based receipt recovery.

## Persian participation receipts · 2026-11-18

Add a private Persian RTL member receipt view for reserved, cancelled and fulfilled participation.

## Private campaign participation API · 2026-11-18

Expose opt-in private campaign participation and status through a dedicated session-scoped database capability.

## Private experience fulfillment · 2026-11-18

Add immutable internal experience fulfillment evidence and prevent cancellation from restoring delivered capacity.

## Consented registration handoff · 2026-11-18

Return an optional registration handoff from the private JSON landing and require stored consent before new-account attribution.

## Private draft submissions · 2026-11-18

Connect authorized private research/content requests to the internal draft queue with actor-bound retry and audit.

## Private CMS document creation · 2026-11-18

Allow verified internal editors to create private CMS documents with exact retry and a single audited creation.

## Tracking quota retention · 2026-11-18

Add maintenance-only bounded pruning of expired tracking quota buckets with counts-only audit.

## Private operations administration · 2026-11-18

Add session-derived, audited internal role delegation and research/content control updates.

## Private review subjects · 2026-11-18

Add role-checked private revision and agent draft reads with canonical payload hashes.

## 2026-11-18 · Private editorial writes

- Add opt-in internal revision and review endpoints that derive their actor from a live verified bearer session and use a dedicated PostgreSQL role.


## 2026-11-15 · restricted internal draft runner

- Add a one-shot research/content intake worker using a dedicated restricted capability; stop at human review and refuse external adapters.
- Execute its compiled CLI with disposable restricted credentials; all 77 compiled API/database tests pass with zero failures/skips.


## 2026-11-15 · M5 CMS and approvals

- Add immutable source-backed content revisions, independent internal reviews and payload-bound expiring approvals.
- Enforce stale-edit/replay/tamper/revocation checks, retain zero-cost private agent drafts, and keep providers/publication unavailable.
- Fresh PostgreSQL/PostGIS and pinned Node validation: 76 compiled API/database tests passed, no failures/skips.


## 2026-11-15 · M5 internal leases

- Add paused, zero-cost draft queues with fenced leases, heartbeats, bounded retry and dead-letter recovery.
- Keep all external effects unavailable; completion requires later human review.


## 2026-11-15 · experience recovery

- Recover participation receipts by original operation and cancel internal reservations atomically, restoring capacity and version budget once.
- Retain immutable participation/first-recorded-visit history and deny public/runtime cancellation.


## 2026-11-15 · consent landing foundation

- Add opt-in Persian RTL landing/consent with a separate restricted capability, explicit Origin and shared transactional rate limits.
- Keep default routes/link activation disabled and scan/click facts separate from installs or visits.


## 2026-11-15 · verified registration tracking

- Attach optional cafe attribution in the atomic new-identity transaction; preserve valid sign-in for unusable metadata.
- Verify concurrency, replay, rollback and returning-account exclusions against disposable PostgreSQL/PostGIS. Public login and SMS remain disabled.


- Record successful exact-code CI and 65-test clean-cluster validation for the M3/M4 continuation and dependency patches.

- Patch 11 reported production dependency advisories with compatible Nest and targeted transitive updates; enforce high-severity production audit in CI.

- Add read-only Persian RTL owner experience preview over restricted-session API, exact budget strings and bounded pagination; keep activation private.

- Produce inactive hash-only café tracking drafts as self-contained Persian RTL printable QR artifacts, verified by an independent decoder.

- Keep café tracking scans/clicks, verified registration facts and genuine QR interactions separate with immutable attribution windows.

- Add independently configured member/café founder cohorts with immutable permanent badges and separately expiring benefit eligibility.

- Reserve experience participation atomically with server-time eligibility, stock/budget limits and cross-campaign first-visit serialization.

- Add private versioned experience eligibility with verified ownership, branch/window limits and independent stock/budget envelopes.

- Issue internal funded referral stars once after reviewed eligibility and independent confirmed QR interaction.

- Cancel internal star reservations atomically with immutable replay receipts, original-lot recovery and one stock return.

- Reject standalone star refunds for open reward reservations until atomic cancellation is implemented.

- Atomically reserve internal star rewards with bounded stock, lot-backed debits and immutable replay receipts; keep delivery disabled.

- Add maintenance-only star account reconciliation of journal totals, spendable units and pending expiries.

- Restore full internal star spends to their still-valid original lots through audited immutable reversals.

- Record funded-star lot expiry once without double-deducting balance or refunding budgets; wait for test backend disconnects during cleanup.

- Add internal serialized star spending with immutable earliest-expiry allocations, idempotent audit and expiry-aware historical balances.

- Add read-only reconciliation of funded star budgets against issued awards.

- Store audited referral review decisions without issuing rewards.

- Add private referral volume screening before any reward decisions.

- Accept optional referral codes on the explicitly composed OTP verification route.

- Bind optional referral attribution to newly created, verified identities.

- Add a server-only transaction hook that runs once for a newly verified identity.

- Add internal expiry-aware inspection of funded star balances.

- Generate internal referral codes with hash-only storage and scoped revocation.

- Record internal verified referral attribution without granting rewards.

- Append non-spendable tier awards with UTC year assignment and scoped qualification totals.

- Add internal issuance of platform stars against a funded budget.

- Reconcile an allocated spend reversal when its original stamp awards remain valid.

- Reconcile full reversals of unused stamp awards without changing journal entries.

- Reconcile documented stamp expiries that exhausted multiple awards in one entry.

- Added maintenance reconciliation for documented single-award legacy stamp expiries.

- Record expired stamp remainders once, preserving both the original award and its allocations.

- Added owner-only allocation of documented legacy stamp spends without rewriting the journal.

- Added an operator-only, read-only stamp reconciliation report for legacy spends, reversals and expiry entries.

- Stamp redemption excludes expired awards and records immutable allocations, spending earliest expiry first.

- Added internal atomic stamp redemption with versioned cost, stock, balance and idempotent receipts.

- Added an isolated HTTP integration test for successful QR awards and concurrent replay.

- Added opt-in QR HTTP routes with strict payload validation; normal startup leaves them unregistered.

- Connected internal QR issuance and consumption to the verified session actor without opening public routes.

- Limited internal stamp QR issuance to five tokens per recipient in a rolling minute, across all branches.

- Added internal expiring single-use QR tokens and atomic stamp consumption.

- Added an internal single-stamp transaction that checks branch authority and returns the original receipt on an identical retry.

- Added immutable storage for café stamps, spendable platform stars and non-spendable tier points, plus versioned stamp rules. No award or redemption endpoint is enabled.

- Added owner-only café name editing to the web panel. Reviewed public listings retain their approved names.

## Staff access forms

- Added owner staff grant/revoke forms with an explicit HTTPS origin, server-side API authorization and redirect-after-submit.

## Staff roster panel

- Added a Persian owner-only staff roster view using the scoped API, with cursor navigation and explicit empty/denied states.

## Read-only café panel

- Connected Persian SSR café and branch panels to verified API scopes. No login shortcut or cookie issuance route is enabled.

## Authenticated café navigation

- Added bounded café and branch lists derived from the verified session and existing RLS policies.

## Branch staff roster

- Added a paginated, owner-only staff roster scoped to one branch. Responses expose account IDs only.

## Branch staff access

- Owners can set branch-specific staff access for an existing verified account. Repeat requests are safe, and real changes are audited.

## Owner access lifecycle

- Added an operator-only owner grant and revocation separate from evidence review, with audit and replay protection.

## Private ownership review

- Added an operator-only evidence decision, claimant status updates and transactional audit. Verification records the outcome without granting a café role.

## M2 ownership request intake

- Added verified-session claim submission, private status list and withdrawal; repeated submission is idempotent for the same café. No owner or tenant privileges are granted by intake.

## Public branch pages

- Added linkable Persian branch pages and an API read constrained to the same reviewed projection as directory search.

## M2 directory review

- Added an operator-only publish/correct/withdraw command backed by a restricted PostgreSQL capability, revision conflict detection and transactional audit.

## M2 directory discovery

- Deferred live SMS and documented the independent product delivery sequence.
- Added moderated branch snapshots, provenance and withdrawal visibility gates, bounded Persian search and the RTL directory page.

## Initial login transport preparation

- Added request and verification routes that are only registered through explicit application composition. The normal startup still exposes neither route. Extended the disposable PostgreSQL fixture to test HTTP OTP issuance, verification, replay rejection and existing tenant authorization.

## SMS.ir provider preparation

- Added an internal verification adapter and offline tests for request format, receipt validation, cancellation and sanitized failures. Application defaults remain disabled; no real message is sent.

## 2026-11-10 · Enforce the Flutter dependency lock

- Recovered the actual Flutter 3.47.5 lock from a refreshed CI artifact, verified the archive checksum, and committed the lock without local paths.
- Enforced the lock and checked for drift in Flutter source, native and cloud development validation.

## 2026-10-25 · Dart dependency reproducibility

- Verified 34221b1 / Foundation CI 40143606737 in all five jobs.
- Found the mobile dependency lock was not yet committed; added a narrow CI artifact of the actual Flutter-generated pubspec.lock so it can be recovered and enforced without invented hashes or a local SDK workaround. Frozen validation follows after recovery.

## 2026-10-25 · Verified foundation checkpoint and safe HTTP errors

- Confirmed 495eaba / Foundation CI 40142933728 successful in all five jobs: real database/HTTP checks, Flutter, complete container and checked-in Android/iOS debug/simulator builds.
- Standardized generic Persian error responses and server-generated request IDs without raw exception/SQL/credential output; local validation passed, own full CI required.
- Consolidated current status/API/security/development instructions and documented the explicit provider/real-send activation gate. M1 remains open; no purchase, initial login or SMS activation.

## 2026-10-25 · Runtime validation and HTTP test ordering

- Tightened runtime login validation to require non-inheriting role membership and no table-owner role membership.
- Corrected an HTTP test ordering expectation after intentional credential rotation/revocation; denials remain strict. Fresh CI pending.

## 2026-10-25 · Existing-session HTTP lifecycle

- Added bearer session status, strict rotating refresh and idempotent logout endpoints; no initial login or SMS route.
- Generated validated TS/Dart session contracts and client helpers; redirect/cookie behavior and full-request deadlines are explicit.
- Added real HTTP rotation/replay/logout-audit tests and canonical expiry validation. New CI pending.

## 2026-10-25 · Checked-in native sources and runtime readiness

- Recovered and checksum-verified official pinned Flutter platform source; checked in Android/iOS projects, Persian native names and debug-only Android HTTP; release signing remains unset.
- Changed CI to build the repository's native projects directly.
- Readiness checks all migration checksums through restricted runtime credentials (migration 007); no migration admin pool is used by the API health route.
- Local Node/type/client checks passed; new native/database CI pending. Browser preview could not access localhost, so visual QA remains unverified.

## 2026-10-25 · OTP operations and client fix

- Verified actual restricted-login tenant HTTP/database tests; corrected the Dart regex literal found by Flutter CI.
- Added delivery deadline/cancellation and fixed bounded expiry cleanup (migration 006), with privilege/late-delivery/live-data tests.
- Fresh local Next build/SSR smoke passed after isolating a generated cache error. New operation/Flutter results await their own CI.

## 2026-10-25 · Authenticated tenant APIs

- Verified atomic identity increment eb4e6a7 in all five CI jobs.
- Added restricted runtime login validation, session-derived transactional RLS for café/branch reads and owner-only audited profile edits; no actor header/body authority.
- Added generated validated TS/Dart scoped response contracts and real HTTP authorization tests; new results pending CI.
- Added CI archive of pinned native source for check-in; no signed build or publication.

## 2026-10-25 · Atomic internal identity

- Composed OTP consumption, encrypted phone identity, audit and session issuance atomically; no ownership/admin membership is inferred.
- Added authenticated private-phone encryption with separate lookup/key-ring secrets and dedicated restricted database role (migration 004).
- Added rollback, concurrency, deletion and least-privilege tests; local unit/type checks pass, new database CI pending. HTTP login/SMS remain closed.

## 2026-10-21 · Persistent internal OTP challenges

- Verified code 353f543 in CI 39552323784: all five jobs SUCCESS, including full development container and Android/iOS debug/simulator builds. Both real-DB runs passed all seven new OTP subtests; the runner reports 10 tests including suite accounting and existing tests. No public login/SMS enabled; remaining M1 gates are unchanged.

- Re-read PR/head and confirmed d75c471 CI fully successful.
- Added private OTP migration 003, expiry/attempts/cooldown and persisted identity/IP limits under transactional locks; single-use and resend/failure states remain internal.
- Added domain-separated keyed phone/IP fingerprints with canonical IP buckets and real-DB lifecycle/concurrency tests; no sending provider or public login enabled.
- Local unit/type checks passed; new migration/integration execution awaits its own CI. M1 remains incomplete.

## 2026-10-20 · Cloud continuation

- Re-read PR #1/head and confirmed handoff CI 39402649968 fully successful, including session DB tests and both native debug/simulator jobs.
- Reproduced frozen dependency installation in a clean cloud checkout. Added tested internal keyed OTP cryptography and a disabled delivery adapter; no public login or SMS enabled.
- Added optional pinned-version development container, shared cloud validation command and a dedicated CI job; container execution awaits its own result.
- Permanent-free commitments, empty commercial dataset and deferred independent loyalty journals are unchanged.

## 2026-10-20 · M1 foundation increment

- Added buildable pnpm workspace, NestJS API and Next.js Persian RTL SSR public site with honest empty/error states.
- Added OpenAPI export, generated validated TypeScript/Dart bootstrap clients and drift check.
- Added default-deny dashboard API guards, permission/normalization tests, initial PostgreSQL/PostGIS migration with RLS, advisory-lock/checksum migration runner and disposable database integration test.
- Added Flutter source tests, real-backend integration test and CI native scaffold/build jobs; native execution pending.
- Local builds/typechecks, 5 combined tests and live Next→Nest smoke passed. Browser visual inspection timed out. M1 remains incomplete: real authentication, database execution and mobile/native results are open.
- CI 39401295349 subsequently confirmed PostgreSQL/PostGIS, Flutter analyze and 4 tests including shared-backend communication, Android debug and iOS simulator builds successful.
- Added a separate internal session lifecycle increment: hashed opaque access/refresh tokens, atomic family rotation/replay and logout locks, expiry/deleted-user checks and audited transitions. No login or SMS endpoint enabled; new database tests await execution.

## 2026-10-19

- Founder selected hajiheidari/ghavehto; inspected existing main history and initial README before preparing foundation commit.
- Recorded founder direction that public café phone listings are in scope, retaining provenance and correction/removal handling.

- Added M0 product, feasibility, research, architecture, schema, scope and risk documentation.
- Added local read-only TypeScript API, Persian RTL connectivity harness, shared contract and HTTP tests.
- Added unbuilt Flutter source proposal and reserved Next web workspace documentation.
- No native apps, database, production authentication, provider integration or public deployment claimed.

Cloud CI 39405670299 on 945de93: web-api-database and mobile-source PASS. The development image successfully built Node/pnpm/Flutter and passed builds/unit/contract checks, then failed at Git diff inside the host-owned bind mount. Scoped Git safe.directory to the explicit workspace for that command; full container rerun pending.

Verified final code checkpoint 8ffa53c: Foundation CI 39406101771 SUCCESS in all five jobs, including the complete development-container validation and Android debug/iOS simulator builds. OTP persistence/limits/identity integration remain the next M1 increment; no real sending enabled.
