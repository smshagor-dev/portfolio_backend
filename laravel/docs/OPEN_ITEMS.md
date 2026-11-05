# Checklist: what remains before full system sign-off

- [ ] End-to-end PHP 8.2 boot test and Composer dependency lock
- [ ] MySQL schema creation and FK validation on clean DB
- [ ] MySQL data import dry-run and full table-by-table QA
- [ ] JWT-to-Sanctum frontend integration tests and 2FA QR support
- [ ] Research OpenAlex abstract enrichment, author role and sync reconciliation
- [ ] Real-time Socket.IO compatibility or frontend migration to SSE/Reverb
- [ ] Contact/admin email notifications
- [ ] Legacy FTP/public media paths and existing uploads copied securely
- [ ] Job Agent profile/AI/ML parity, recruiter discovery, company-specific job boards
- [ ] Gmail OAuth live flow, approved-source sync tests and background scheduler
- [ ] Job email PDF attachment, event tracking and SMTP delivery dry-run
- [ ] Analytics GA4 parity and dashboard contract tests
- [ ] Public/admin file uploads and SEO verification file workflow tests
- [ ] Article/project/service/comment JSON response parity with current frontend
- [ ] Security review (rate limits, XSS, SQL/SSRF, secrets, OAuth, file validation)
- [ ] cPanel deployment rehearsal and rollback test

All checks must be **verified** before closing; code presence alone is not a passing check.
