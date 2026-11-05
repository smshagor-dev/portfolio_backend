# Required before "full system ready"

The codebase contains Laravel scaffolding and partial implementations, **not a verified, production-ready rewrite**. Checkboxes refer to verified behaviour, not presence of PHP files.

- [ ] Composer lockfile generated on PHP 8.2-compatible dependency environment
- [ ] Docker PHP 8.2/MySQL build passes, all migrations apply and all tests pass
- [ ] Complete 1:1 frontend API contracts (request/response shape, errors, URLs and auth)
- [ ] Actual MongoDB content export/import, 49-table count and foreign-key reconciliation
- [ ] Sensitive settings, admin identities and old sessions migrated/rotated securely
- [ ] All existing media/assets migrated with FTP/public path compatibility
- [ ] Real-time Socket.IO compatibility or frontend transition to Reverb/SSE/polling
- [ ] Full Job Agent company job boards, recruiter discovery/verification, automatic source scheduling
- [ ] Gmail OAuth consent and read-only alert ingestion integration tests
- [ ] SMTP opt-in/approval and daily-limit tests, open/click tracking, CV attachment handling
- [ ] Job Agent cover-letter PDF rendering, Unicode and private delivery tests
- [ ] Research ORCID, Crossref and OpenAlex live data quality tests, author role and reconciliation
- [ ] Real AI provider integrations, verified prompts, fallback behavior and safety limits
- [ ] Public/admin file validation, SEO verification file approval, analytics and notification parity
- [ ] Security/rate-limit validation, negative tests, error handling, performance and backup tests
- [ ] cPanel/PHP-FPM deployment rehearsal, rollback and cutover

Local Windows setup is in docs/LOCAL_WINDOWS.md. The current CI workflow is failing without usable job logs and must not be treated as a passing test.
