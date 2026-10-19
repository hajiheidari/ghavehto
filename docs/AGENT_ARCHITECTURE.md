# Agent architecture

No AI API or scheduled external agent is enabled in this foundation. Deterministic parsing, normalization, deduplication, SMS segment counting and budget arithmetic do not need LLMs.

Lifecycle: queued → leased → running → awaiting_review → approved → executing → succeeded; failed/retry_wait/cancelled/paused are explicit states. Workers use Postgres SKIP LOCKED leases, heartbeat, bounded exponential retry, dead-letter review and operation idempotency. Pause prevents new leases and re-checks before every external action. Outbox separates committed decisions from delivery; external effects require provider idempotency/reconciliation.

Discovery adapters allow only permitted public structured data; check source terms/access/rate and photo rights before enabling. Store provenance, normalization originals, duplicate confidence and review uncertain matches. No CAPTCHA/auth bypass and no large import without approval.

Outreach creates drafts/claim links only by default. Consent/suppression and provider authorization checked before delivery. Preview Persian Unicode segment estimates (70 single / 67 concatenated UTF-16 units as initial provider-dependent model; account for emoji surrogate pairs and validate provider billing). Calculate quantity × segments × quoted rate, reserve budget atomically, and require explicit bulk approval binding recipient set, text and ceiling. Opt-out wins over retries.

R&D records source/publication/retrieval dates, confidence, dedup hash and Iran relevance; unknown dates remain unknown. Content keeps original sourced revisions and draft → review → approval → publish; no copied articles or silent auto-publishing. Founder recommendations and café notifications have separate approvals/preferences.

Dashboard target: queue/history, run/pause/resume, logs, source evidence, error/dead letter, retry count, estimated/actual cost, approval diff and audit. Roles: operator may run permitted research, editor reviews drafts, admin approves consequential actions. AI optional adapter has zero default budget and explicit per-job ceiling. Major brand partnership agent deferred.
