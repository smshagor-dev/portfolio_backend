# MySQL data import strategy

The source Express backend uses MongoDB. Import only into a new isolated MySQL database after backups.

1. From the Node repository root export: node laravel/tools/export-prisma.js
2. The export is stored privately as laravel/storage/app/imports/portfolio-export.json.
3. Sensitive models AdminUser, AiProvider, AiSettings and Job Agent credential settings are excluded. SiteSettings exports a whitelist of public website/SEO/legal fields only, not SMTP credentials.
4. In Laravel run: php artisan migrate, then php artisan db:seed, then php artisan portfolio:import portfolio-export.json for a dry run.
5. After verification run: php artisan portfolio:import portfolio-export.json --commit and confirm interactively.
6. New record IDs are inserted, existing IDs skipped. The sole exception is whitelisted SiteSettings fields, which update the blank seeded record id=1.
7. Configure SMTP, OAuth, AI keys and the admin account manually; never export their credentials.
8. Validate all row counts, foreign keys, media URLs, privacy and frontend API contracts before cutover.

The export contains personal data and ticket tokens. Keep it on a secure host; never commit or share it.

Importer checks that every exported model collection has an import handler; unknown/missing mappings fail instead of silently dropping records. AiTrainingEntry is included.
