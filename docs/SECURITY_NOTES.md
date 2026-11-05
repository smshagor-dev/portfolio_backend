# Laravel security choices

- Admin API uses Sanctum bearer tokens; no stateful cookie auth or CSRF ambiguity for the Next.js bearer-token client. Limit frontend CORS to configured origins.
- Login is throttled, requires bcrypt-compatible password validation, and enforces TOTP when enabled.
- TOTP secrets are encrypted at rest with APP_KEY; do not import plaintext legacy secrets.
- No seeded admin password; create an account interactively.
- Public contact uploads use private storage with token-protected downloads; never serve arbitrary files directly.
- Job Agent email sending is deliberately disabled until explicit review, SMTP/Gmail migration and integration tests.
- MongoDB and legacy SQL data are not imported automatically.
- Docker context excludes .env, data imports, logs, vendor and SQL dumps.
- Root Vercel production remains Express; this Laravel PR is draft and should not be merged before verified staging tests.

Before production: enable HTTPS, secure credentials and logs, rotate secrets, use a least-privilege MongoDB Atlas user, review rate limits and request origins, run input sanitization and file/content security tests, add monitoring and backups.
