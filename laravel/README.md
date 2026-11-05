# Portfolio backend — Laravel migration

This is an **isolated Laravel 12 / PHP 8.2 / MySQL replacement project** under `laravel/`. The existing Express/Vercel project at repository root is unchanged. This is a staged migration, **not a full production cutover**.

## Requirements
- PHP 8.2 or newer (target/runtime: PHP 8.2), Composer 2
- MySQL 8.0+ (or compatible MySQL), extensions: pdo_mysql, mbstring, intl, zip, bcmath, openssl
- Laravel 12, Sanctum for admin API tokens

## Install without Docker
```bash
cd laravel
composer install
cp .env.example .env
php artisan key:generate
# Configure DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD in .env
php artisan migrate
php artisan db:seed
php artisan portfolio:admin admin@example.com Administrator
php artisan storage:link
php artisan serve
```

## Docker development
```bash
cd laravel
cp .env.example .env
# Set unique DB_PASSWORD and MYSQL_ROOT_PASSWORD in laravel/.env
docker compose up -d --build
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate
docker compose exec app php artisan db:seed
docker compose exec app php artisan storage:link
```
API: http://localhost:8080/api/health

**Important**: Database credentials and APP_KEY belong in environment variables, never in Git. Existing MongoDB data is **not migrated automatically**. Run MySQL migrations on a separate database and validate API parity before switching traffic.

See `docs/DEPLOYMENT.md`, `docs/MIGRATION_PLAN.md`, `docs/API_PARITY.md` and `docs/DATA_IMPORT.md` for milestones and scope.

Windows setup: docs/LOCAL_WINDOWS.md. The Node/Vercel production backend remains unchanged.

## Read-only checks

After migrations: `php artisan portfolio:preflight --strict`. From repository root: `node laravel/tools/audit-route-parity.js` to compare HTTP route shapes with Express. These checks are not substitutes for end-to-end tests.

Legacy public asset dry-run: `php artisan portfolio:import-assets`; see `docs/ASSET_MIGRATION.md`.
