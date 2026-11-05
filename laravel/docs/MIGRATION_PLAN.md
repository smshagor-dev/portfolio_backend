# Express to Laravel migration plan

Source: repository root (`index.js`, `routes/`, `services/`, `prisma/schema.prisma`). New target: `laravel/`.

1. **Foundation**: Laravel 12 on PHP 8.2, MySQL 8, Sanctum, env and Docker; do not alter the Vercel root app.
2. **Schema**: map the 49 Prisma collections to MySQL tables, relationships, indexing and JSON fields. MongoDB ObjectIds become MySQL IDs; preserve existing numeric IDs only during an explicit export/import.
3. **Read APIs**: port `/api/site/home`, project/service/pricing/article detail, settings and research listing without changing JSON response shapes.
4. **Admin**: implement admin creation, login, 2FA, profile management, settings and content CRUD with strict authentication and authorization.
5. **Write APIs**: validated contact tickets, comments/replies, uploads, analytics and notifications with rate limiting.
6. **Research**: ORCID/Crossref/OpenAlex fetchers, dedupe, manual-override policy, scheduled sync.
7. **Job Agent**: Gmail OAuth, approved job-source ingestion, AI provider orchestration, recruiter checks, review-before-send workflow and tracking (opt-in).
8. **Cutover**: data export/import, endpoint-contract tests, staging soak test, secrets rotation, frontend API-base switch, DNS/hosting transition, rollback plan.

Do not use `db:wipe`, destructive seeds or automatic schema drops on any existing database. Auth tokens and old bcrypt passwords must be migrated or rotated with an explicit procedure. Serverless Vercel Node deployment is not a PHP runtime; host Laravel on PHP 8.2-capable infrastructure.
