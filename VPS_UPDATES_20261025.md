# VPS updates — 25 October 2026

This commit records the selected latest live VPS files, not a new deployment.
No environment files, credentials, wallet data, customer data, database dumps, or backups are included. Existing repository files and history are preserved.

## Organic SMM
- Custom bundle labels/icons and views-style custom scheduling.
- Provider-aware comment inputs and separate custom comments.
- First-visit defaults: Views 1000, Likes 25, Comments 1, Shares 13, Reposts 11, Saves 12.
- Views always equals base quantity; saved ratios are sanitized and versioned.
- Admin price priority and higher precision for INR-facing pricing. Internal USD conversion at rate 90 remains; this is not a wallet currency migration.
- Reach/Impressions starts off with the right-side hand hint and visible switch.

Run `node --test tests/vps/*.test.cjs` for standalone regression checks.
Apply the idempotent custom metadata migration only when the target database lacks these columns. Live configuration rows are not exported.
