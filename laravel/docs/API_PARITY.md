# Express => Laravel API contract tracker (November 2026)

The Laravel 12/PHP 8.2/MySQL rewrite is on a **draft branch** and is not proven runtime-compatible. The root Node/Express backend remains in production. Status below means *code present*, not tested or production-ready.

| Module | Implemented in new PHP code | Still missing / requires verification |
|---|---|---|
| Laravel platform | Bootstrap, MySQL 8 Docker, Sanctum and 49 Eloquent models | Composer lock, PHP 8.2/MySQL migration test, route tests |
| Public portfolio | Home, projects/services, articles, pricing, settings, comments, testimonials | Exact frontend JSON contract, DEV feed, public image uploads |
| Admin CMS | Dashboard, bulk content edits, articles/projects/categories, legal pages, notifications, emergency contacts | Full transactional parity, validation and rich-content sanitization |
| Authentication | Admin login, Sanctum, bcrypt passwords, TOTP, logout | QR payload image generation, migrations of legacy sessions and passwords, full QA |
| Contact tickets | Create/read/reply, admin status and replies, private upload downloads | Email delivery, Socket.IO event compatibility |
| Research | Listing, admin CRUD, optional ORCID/Crossref sync, manual override marker | OpenAlex abstracts, role classification, reconciliation, live tests |
| AI assistant | Admin provider configuration and OpenAI/DeepSeek/Gemini clients | Live API calls, existing prompt/knowledge parity |
| Job Agent | Public provider imports, Gmail OAuth2 read-only alert import, job/profile settings, drafts, approval, guarded SMTP, heuristic matching | Real company website adapters, complete recruiter discovery/validation, automated safe scheduling, tracking, PDF letters, full prompts/AI scoring, live OAuth/SMTP tests |
| Analytics | Visitor heartbeat, totals/trends, admin dashboard | Optional GA4 Data API, legacy UI analytics contract |
| Uploads | Private contact files; public/admin image and resume endpoints | Legacy FTP media paths, antivirus/image processing, full media migration |
| Database transfer | Read-only Prisma exporter, JSON import with dry-run | Production record audit, sensitive credential handling, data validation, asset move |
| Delivery | Docker compose, Windows runbook, PHP CI workflow | CI currently fails before usable test results; local staging execution required |
| Realtime | None; REST writes exist | Socket.IO / compatible frontend transport, event authorization and notifications |

## Blockers before *claiming* full local readiness

1. Resolve or bypass the unavailable CI runner by executing **composer install, php -l, artisan migrate, route:list and php artisan test** in a genuine PHP 8.2/MySQL Docker environment.
2. Fix all runtime/migration/test errors detected there. No current source-only review can substitute for this.
3. Export MongoDB data to isolated MySQL staging and verify every table count and FK. Never wipe existing production data.
4. Port missing Socket.IO / background jobs / email notifications / PDF generation / FTP storage or update the frontend to compatible replacements.
5. Compare every request and response shape with the production Express APIs and frontend usage.
6. Test Gmail OAuth, AI provider keys, SMTP and ORCID API with operator-supplied environment configuration. Keys should never be pasted into Git/Chat.
7. Perform a complete cPanel/PHP-FPM deployment rehearsal, backup, rollback and security audit before cutover.

**Do not merge this PR as a declaration of feature parity or switch production traffic yet.**
