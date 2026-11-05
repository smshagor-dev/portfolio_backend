# Portfolio backend — Laravel 12 / PHP 8.2 / MongoDB Atlas

This is an **isolated, unverified migration candidate** under `laravel/`. The original Node/Express/Vercel backend at the repository root remains untouched.

## Requirements

- PHP 8.2+ and Composer 2
- PHP extension `mongodb` (and mbstring, intl, zip, bcmath, openssl)
- Laravel 12, `mongodb/laravel-mongodb` 5.12+, Laravel Sanctum
- Atlas URI in private `laravel/.env`, plus the exact `MONGODB_DATABASE` used by Prisma

## Local install (Windows PowerShell)

```powershell
cd E:\portfolio_backend\laravel
composer install
# Create / edit your private .env from .env.example
# DB_CONNECTION=mongodb
# DATABASE_URL=your MongoDB Atlas URI
# MONGODB_DATABASE=the existing Prisma database name
php artisan key:generate
php artisan optimize:clear
php artisan portfolio:preflight
php artisan serve
```

The health endpoint `/api/health` performs a live MongoDB ping; `/` shows the API welcome dashboard. The app uses existing MongoDB collections directly, **not MySQL migrations or a JSON import**. Validate collection mapping, IDs, relationships and write paths on a staging database before production.

## Docker development

```powershell
docker compose up -d --build
docker compose exec app php artisan key:generate
docker compose exec app php artisan portfolio:preflight
```

Docker Compose now contains only `app` and `nginx`, not MySQL.

## Deployment and legacy FTP warning

**Do not switch production yet.** The Laravel upload controller now uses the old Express FTP settings through `league/flysystem-ftp` and returns `/uploads/*` paths and `publicUrl`; it does not save uploads locally. Remote FTP functionality needs a real staging upload/download test before live cutover. A private FTP root must be explicitly configured for Job Agent CVs and PDFs. See [docs/FTP_UPLOAD.md](docs/FTP_UPLOAD.md).

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/LOCAL_WINDOWS.md](docs/LOCAL_WINDOWS.md), [docs/ASSET_MIGRATION.md](docs/ASSET_MIGRATION.md) and [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md).
