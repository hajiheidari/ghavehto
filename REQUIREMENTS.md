# Product requirements · baseline 2026-10-19

The founder's 35-section master prompt is the authoritative scope. This document organizes delivery and does not remove deferred requirements. Acceptance tests belong to the milestone introducing each behavior.

| Area | Required behavior | Delivery |
|---|---|---|
| Identity/platforms | Persian RTL, future locales, Flutter iOS/Android, SSR Next public web, responsive café/admin/agent dashboards | M1 onward |
| Accounts | Guest, consumer, owner, branch manager, staff, admin, editor, agent operator, future partner; multi-role identities, phone verification, scoped RBAC, deletion | M1–2 |
| Directory | Nationwide provinces/cities/neighborhoods, address/geo/hours/photos/menu/amenities/branches, provenance, freshness, correction/takedown | M2 |
| Discovery | Name/city/area/map/nearby permission, amenities, loyalty, exclusive/new drinks/new cafés/founders; balanced ranking | M2–4 |
| Ownership | Unclaimed distinct from partner; progressive claim/verification/activation, staff and branch management | M2 |
| Loyalty | Café-specific stamps, expiring QR, authorized staff, replay/rate/idempotency controls, reward inventory and audit | M3 |
| Platform rewards | Independent immutable stars and tier ledgers, expiration, reversals, annual qualification, inventory, reconciliation | M3 |
| Referrals | Unique links, verified registration and optional genuine interaction, self/duplicate/farming prevention, configurable risk/caps | M3 |
| Experiences | All requested campaign types, eligibility/stock/dates/branches/budget, server redemption, optional first-visit participation | M4 |
| Founders | Separate café/member configurable windows (proposed 30 days); verified eligibility, permanent badges vs temporary benefits | M4 |
| Acquisition | Printable café QR, association, scan/click/registration/verification/interaction separately; no inferred installs | M4 |
| Collaboration | Transparent capped signals; never guaranteed position or referral-dominated rankings | M4 |
| Operations | Free basic café metrics/tools; founder configuration, reasoned sensitive adjustments, source and audit history | M2–5 |
| Agents | Discovery/outreach/research/content, queues/schedules/pause/retry/approval/cost/provenance; no autonomous spending/publication/bulk sending | M5 |
| Content | Original sourced drafts, editorial approval, shared CMS, SEO metadata/internal links, stale-content review | M5 |
| Notifications | Preferences, bounded frequency, permissions, push/in-app/provider adapters, operational suggestions | M4–6 |
| SEO | SSR canonical café/city/area/editorial pages, sitemap/robots/OG/structured data, thin-page noindex | M2–5 |
| Security | Sessions/OTP/RBAC/validation/CSRF/XSS/rate limits/secrets/backups/privacy/account deletion/audit | Every milestone |
| Future | Equipment/beans/education/supplier/sponsored/optional business services via flags, separate from loyalty | Post-MVP |

Permanent free promises cannot be paywalled. No mandatory field staff. Major chains and major-brand agents are deferred. No paid providers or external action without founder authorization. Imported photos require permission and imported profiles imply no partnership.

Additional requirements proposed for consideration, not expanded MVP commitments: café closure/dispute handling; accessibility review with Persian screen readers; interrupted redemption recovery; reward liability ownership and dispute SLA; fraud appeals; retention and legal-hold policy. Offline earning must not bypass server authorization.

Event definitions: directory_imported is a provenance-backed accepted record; claimed is a submitted claim; verified is approved evidence; active is a configurable recent genuine interaction, not login; qr_scan and store_click are attribution events; registration/phone_verified/interaction_confirmed are separate server facts. Document attribution confidence and window; use no raw phone in analytics.
