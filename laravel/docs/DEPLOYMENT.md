# PHP 8.2 / MySQL deployment runbook

Current production remains the Node/Express backend deployed on Vercel. Laravel cannot replace the Node function by dropping a PHP folder into Vercel.

## cPanel / VPS deployment
1. Choose a PHP 8.2-supported host with Composer 2 and MySQL 8.0+ (PHP-FPM recommended).
2. Deploy only the laravel/ project and run composer install --no-dev --optimize-autoloader. Ensure composer.lock has been generated and committed from a verified build before production.
3. Set site document root to laravel/public, **never** the repository root or laravel/ directly.
4. Copy .env.example to .env on the server; set APP_ENV=production, APP_DEBUG=false, APP_URL, APP_KEY, DB_*, MAIL_* and frontend origin. Generate an APP_KEY securely with php artisan key:generate.
5. Create an empty MySQL database/user with limited privileges, then run php artisan migrate --force and php artisan db:seed. Never run the old Node dev database setup against production.
6. Run php artisan portfolio:admin YOUR_EMAIL "Administrator" to create admin. Enable TOTP 2FA.
7. Allow write access to storage/ and bootstrap/cache; run php artisan storage:link if needed.
8. Test /api/health, /api/site/home, admin login, projects, research, tickets and profile data against the unchanged Express site.
9. Only after full data import, asset migration, auth migration and contract tests, change the frontend API base URL. Keep Express routing for rollback until stable.

## Current blocking items
- Not yet run composer install, php artisan migrate or PHPUnit on a live PHP 8.2/MySQL environment.
- Schema migrations are generated for 49 models; real data import and legacy asset migration need staging verification.
- Missing production parity: Socket.IO, research sync, OAuth/Gmail, email sending, API contract response differences.
- GitHub CI workflow provides PHP syntax, MySQL migrations, route-list and PHPUnit checks. If Actions is unavailable or billing-blocked, these checks must be run manually before merge.
