# Brief: What is our database backup retention schedule and when is the weekly backup taken?

As of: 2026-09-12T12:25:35.736Z
Mode: home
Status: published

## Answer
- Production PostgreSQL snapshots are retained for 30 days in cold storage.
- Full database backups are executed weekly on Sundays at 02:00 UTC.
- Point-in-time recovery (WAL archiving) is maintained with a 7-day retention window.

## What I used
### Private
- facilities_hvac_memo
- infra_db_policy
### Web
- None
### Could not be checked
- None

## Evidence
- Claim: Production PostgreSQL snapshots are retained for 30 days in cold storage.
  - [private] infra_db_policy — “Production PostgreSQL snapshots are retained for 30 days in cold storage.”
- Claim: Full database backups are executed weekly on Sundays at 02:00 UTC.
  - [private] infra_db_policy — “Full database backups are executed weekly on Sundays at 02:00 UTC.”
- Claim: Point-in-time recovery (WAL archiving) is maintained with a 7-day retention window.
  - [private] infra_db_policy — “Point-in-time recovery (WAL archiving) is maintained with a 7-day retention window.”

## Uncertain / missing
- None identified.

## Open loops
- None.

## Actions
- No actions proposed.

## What I did not do
- Did not perform actions without verified user approval.
- No unverified claims published. Withheld ungrounded assumptions.
