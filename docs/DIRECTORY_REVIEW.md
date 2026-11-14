# Internal directory review

This operation is independent of consumer sign-in. Use a disposable or separately approved database. No reviewer login is created automatically. A database administrator can grant `ghahvehto_directory_review` with SET ROLE access to an individual restricted login; do not grant it to the web/API login, café accounts or shared identities. Store that DSN securely as `DIRECTORY_REVIEW_DATABASE_URL`. The CLI does not use the migration DSN as a fallback.

Inspect the current reviewed snapshot and revision in `public.directory_review_queue` using that role. To apply a decision, pass one reviewed JSON document on stdin to `pnpm --filter @ghahvehto/api directory:review`. Required fields:

- `branchId`: existing branch UUID.
- `expectedRevision`: 0 for first publication, otherwise the revision read during review.
- `decision`: `publish` for a first publication or correction, `withdraw` to remove an existing entry from public view.
- `reason`: concise review reason without personal information.
- For publication only: `sourceId` must be a permitted source for the same café, and `listing` contains exactly `cafeName`, `branchName`, `province`, `city`, and `neighborhood` (empty if unknown).

The function serializes decisions per branch and verifies the expected revision before changing anything. A stale decision must be reviewed again. Each committed decision records the database login, before/after snapshot and reason in the audit log. Withdrawal hides an entry immediately while retaining its reviewed history; it is not a permanent purge. Changes to source permissions also take effect immediately in public search. Neither the review queue nor the function is available through public HTTP.
