# Job Agent Laravel migration scope

Implemented behind Sanctum admin authentication:
- read jobs, matches, drafts, board sources, preferences and a computed overview
- add a manually supplied job from a validated public URL
- write a manual draft and explicitly approve/reject it
- sending endpoint fails closed (HTTP 501)

Not migrated or not enabled:
- AI-generated matching/drafting, company contact discovery/validation, Gmail OAuth and mailbox sync
- remote job-source ingestion, automatic scheduling, sending, email tracking pixels/clicks
- full frontend-compatible overview response and CV/profile builder

Do not enable auto-send or point the existing production admin dashboard at these endpoints until integration/contract tests pass. The MySQL tables exist, but the data migration must be separately performed.
