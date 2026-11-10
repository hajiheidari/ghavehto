# Private ownership review

Use a separate restricted individual login granted SET ROLE access to `ghahvehto_ownership_review`. Do not grant it to the runtime or café roles. Read pending claims from `public.ownership_review_queue`.

After reviewing evidence in an approved private case system, pass one JSON document with `claimId`, `evidenceCaseId` (both UUIDs), and `decision` (`verified` or `rejected`) on stdin to `pnpm --filter @ghahvehto/api ownership:review`. Set `OWNERSHIP_REVIEW_DATABASE_URL` securely for the operator. Use an opaque case ID; never enter documents, personal information or links here.

The app records a reviewer attestation, not an automated evidence check. Decisions and audit commit together. A claim cannot be reviewed twice or after withdrawal. Verification leaves operational ownership and public partner status unchanged. No evidence storage, reviewer account or HTTP review endpoint is provisioned.
