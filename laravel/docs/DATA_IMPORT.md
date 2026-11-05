# MySQL data import strategy

The original Node API uses MongoDB and the repository contains a legacy 30 MB SQL dump. Neither is imported automatically or overwritten.

1. Back up the **actual running source** first, including collections, uploads and metadata. Work on a separate MySQL database.
2. Export Prisma model records as a JSON object keyed by exact Prisma model names (e.g. Profile, Project, ResearchPublication), containing arrays of objects with camelCase field names. Preserve numeric IDs and relation IDs.
3. Save the export **outside Git** as laravel/storage/app/imports/export.json with restrictive filesystem permissions. No PII or secret tokens in commits.
4. Run `php artisan portfolio:import export.json` for JSON structure dry-run. Run `php artisan portfolio:import export.json --commit` only after backup and manual confirmation.
5. Credential-related models are deliberately rejected: AdminUser, AiProvider, AiSettings, SiteSettings, JobAgentSettings, JobAgentEmailSetting, JobAgentAiSetting. Run `php artisan db:seed` to initialize blank settings and `php artisan portfolio:admin EMAIL NAME` to create admin securely.
6. The import inserts missing IDs and skips existing records, without truncating or overwriting collections. Verify totals, relationships, timestamps, media paths, and authentication before switching frontend base URL.

All 49 model tables exist in Laravel, but the importer's approved non-sensitive model allowlist covers 42 of them; a full production export/import requires review of sensitive models and GDPR/retention rules.
