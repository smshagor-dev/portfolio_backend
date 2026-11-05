# Backend API migration coverage

This is a **staged migration**, not a claim of 1:1 parity. All endpoints need Laravel/MySQL integration and frontend contract tests.

| Module | Laravel implementation | Remaining |
|---|---|---|
| Health | /api/health | live smoke test |
| Public portfolio | home, settings, pricing, project/service/article detail | response field parity, DEV articles |
| Research | listing, featured, detail, counters, comments | ORCID/Crossref/OpenAlex sync and manual override |
| Authentication | admin login, profile, password, TOTP 2FA, Sanctum tokens | frontend integration and expiry tests |
| Admin content | projects, articles, categories, research CRUD; legal pages; profile | original bulk content editor, media admin, analytics dashboard |
| Contact | create/read/reply ticket, privately stored file downloads | outbound email, Socket.IO and admin ticket replies |
| Comments/reviews | projects, services, articles, research, testimonials | Socket.IO updates, moderation panel |
| Analytics | heartbeat with hashed visitor IP | full reporting endpoints |
| AI assistant | OpenAI-compatible endpoint, env-configured | DeepSeek/Gemini and complete knowledge retrieval |
| Job agent | read jobs, matches, drafts, approved manual drafts | Gmail OAuth, actual AI matching, job source sync, email sending, tracking |
| File storage | Laravel private contact uploads | FTP and existing public asset URL compatibility |

Existing root Express/Vercel API remains unchanged until verified cutover. The Laravel project must be deployed to a PHP 8.2-capable server; Vercel Node functions do not execute PHP.
