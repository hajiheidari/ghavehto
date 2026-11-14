# Private ownership review

Use a separate restricted individual login granted SET ROLE access to `ghahvehto_ownership_review`. Do not grant it to the runtime or café roles. Read pending claims from `public.ownership_review_queue`.

After reviewing evidence in an approved private case system, pass one JSON document with `claimId`, `evidenceCaseId` (both UUIDs), and `decision` (`verified` or `rejected`) on stdin to `pnpm --filter @ghahvehto/api ownership:review`. Set `OWNERSHIP_REVIEW_DATABASE_URL` securely for the operator. Use an opaque case ID; never enter documents, personal information or links here.

The app records a reviewer attestation, not an automated evidence check. Decisions and audit commit together. A claim cannot be reviewed twice or after withdrawal. Verification leaves operational ownership and public partner status unchanged. No evidence storage, reviewer account or HTTP review endpoint is provisioned.
## Owner access

Access is a separate operator decision. Provision an individual restricted login with SET ROLE access to `ghahvehto_ownership_access`; do not grant this role to the reviewer or runtime login. Configure `OWNERSHIP_ACCESS_DATABASE_URL` securely and pass `{claimId, operation, reason}` to `pnpm --filter @ghahvehto/api ownership:access`. Operation is `grant` or `revoke`. Do not include personal data in the reason.

Grant requires verified evidence, an eligible claimant and a published branch. It cannot replace an existing owner. Revocation removes the exact membership while keeping the audit and the user's account. A revoked decision cannot be replayed to restore access; a reassessment workflow is still needed. Neither action publishes a partner badge.
