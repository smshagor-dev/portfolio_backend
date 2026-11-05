# Remaining verification before production deployment

The repository contains a single Laravel 12 PHP backend at its root, backed by existing MongoDB Atlas collections. Removing Express and the original MySQL migration plan does not itself prove runtime or data compatibility.

- [ ] Produce and commit a fully tested composer.lock for PHP 8.2.
- [ ] Run the root-level PHP 8.2 CI checks including route/list and isolated MongoDB integration tests.
- [ ] Check the deployed Apache/cPanel document root is the repository public/ directory, not the source root.
- [ ] Test API status, login, bcrypt legacy users, TOTP 2FA and Sanctum token issuance on staging.
- [ ] Verify all public frontend JSON contracts, founder section CRUD, uploads, research status and job-agent endpoints.
- [ ] Validate Atlas collections, numeric IDs, write paths, date mapping and permissions with a staging database.
- [ ] Test FTPS upload/read, private job-agent storage and remote media URL consistency.
- [ ] Verify historical public uploads (images and PDFs), founder WebP previews, research SVG and Google verification.
- [ ] Test background research sync, scheduling, Gmail OAuth, notifications and mail safety on staging.
- [ ] Review security headers, negative tests, asset MIME types, rate limiting, error JSON, backup and recovery.
- [ ] Run a full production cutover rehearsal, including rollback from backup/pre-laravel-root-20261106.

The old Express/Prisma server is intentionally absent. The obsolete MySQL import/export commands and Node route parity audit are removed. Root-level deployment instructions are in docs/DEPLOYMENT.md.
