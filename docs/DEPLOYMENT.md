# Production deployment | Laravel application at backend repository root

Laravel is the only source application. There is no laravel/ subdirectory and no Node/Express server in the current branch.

1. BACK UP existing .env, Atlas database, remote FTP media, and any local untracked uploads. Keep vendor/, storage/ and bootstrap/cache/ outside bulk extraction and never delete those directories just to refresh the source code.
2. Confirm PHP 8.2+, Composer 2 and required PHP extensions, especially mongodb and ftp, in both CLI and web PHP runtime.
3. CRITICAL: Set the domain document root to <repository>/public (not <repository>). Make sure /composer.json, /.env, /app/ and /vendor/ cannot be downloaded.
4. Fetch main after the merge. Check that artisan, composer.json, app/, routes/, config/, bootstrap/ and public/index.php exist at the repository root. There must be no index.js, package.json, prisma/ or laravel/ directory in a clean checkout.
5. Install and clear cache from backend root:

       composer install --no-dev --optimize-autoloader
       php artisan optimize:clear
       php artisan portfolio:preflight
       php artisan route:list

   The repository currently lacks a committed composer.lock; establish and test a lockfile before a reproducible production upgrade. Running portfolio:preflight --strict will flag the missing lockfile.

6. Preserve APP_KEY, DATABASE_URL, MONGODB_DATABASE, passwords/2FA and FTP settings. Set APP_ENV=production, APP_DEBUG=false, correct APP_URL, FRONTEND_URL, and CORS_ALLOWED_ORIGINS. The app uses the existing MongoDB Atlas collections directly; DO NOT run migrate:fresh, MySQL migration scripts, or Prisma import tools.
7. Test staging first: /api/health, /api/site/home, /api/site/founder-projects, legacy /uploads/ and /research/ media, /api/admin/login and 2FA, founder CRUD, FTP image uploads, research sync and contact form. Confirm all /api/* failures return JSON rather than HTML.
8. Keep cron paths pointing to the root artisan file. If Laravel scheduler is configured: php /absolute/path/to/portfolio_backend/artisan schedule:run. Only change the production cron after verifying its correct schedule.

The Git-tracked legacy public assets are preserved under the new public/ directory, excluding an unsafe SQL upload. FTP-only historical media is NOT included in Git and must be backed up separately.

ROLLBACK: The original repo tree is available in backup/pre-laravel-root-20261106. Restoring Git does not restore live database state; also restore the appropriate document root and hosting configuration.
