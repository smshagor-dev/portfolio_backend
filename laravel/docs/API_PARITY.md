# Express => Laravel API parity tracker (5 Nov 2026)

**148/148 Express HTTP route shapes are now represented in Laravel (some by explicit 501 responses); this is a static match only, not functional parity. Code present does not imply tested or feature-complete.** Root Express/Vercel production remains unchanged.

| Module | New Laravel code now includes | Remaining before 1:1 sign-off |
|---|---|---|
| Foundation | Laravel 12, PHP 8.2 Docker, MySQL, 49 Eloquent models, 21 FKs | Composer lock, migrations and tests on real PHP 8.2/MySQL |
| Public portfolio | Home, projects, articles, services, pricing, feedback uploads and comments | DEV feed, response/error contract tests |
| Admin CMS | Dashboard, bulk edits, articles, categories, projects, notifications, tickets, uploads | Full validation, article editor and SEO parity |
| Admin login | Sanctum bearer tokens, bcrypt, TOTP, password management | QR image, migrated legacy auth contract, integration tests |
| Contacts | Private tickets, messages, admin replies and opt-in email notifications | Socket.IO/real-time compatibility, delivery testing |
| Research | ORCID/Crossref sync, DOI-based OpenAlex abstracts, admin/listing, editorial overrides | Author roles, metadata reconciliation and API tests |
| AI | OpenAI, DeepSeek and Gemini providers, context selection, training/settings | Quality and live provider tests |
| Job Agent | Gmail readonly OAuth, trusted board APIs, manual jobs, recipient approval, guarded SMTP, AI drafts, private PDF cover letters, settings | Company adapters, real recruiting workflows, tracking, attachment delivery and full automation |
| Analytics | Visitor heartbeat, internal dashboard metrics | GA4 Data API and UI contract parity |
| Storage | Private CV/ticket media, public uploads, local Docker storage | Legacy public uploads and FTP remote storage migration |
| Data move | Read-only Prisma exporter, dry-run MySQL importer | Real export/import and data integrity checks |
| CI | GitHub Actions PHP 8.2/MySQL workflow | Runner checks failing; no passing migration/test evidence |

Do not switch live frontend traffic or merge PR as full migration until the open items and runtime tests pass.
