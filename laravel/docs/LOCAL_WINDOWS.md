# Laravel MongoDB local setup — Windows / PowerShell

The Laravel backend uses MongoDB Atlas via `DATABASE_URL` and `MONGODB_DATABASE`. It does **not** require MySQL or import the old MongoDB JSON dump.

## Native PHP (XAMPP PHP 8.2)

```powershell
cd E:\portfolio_backend\laravel
php -v
php -m | Select-String 'mongodb|ftp'
composer install
php artisan key:generate
# Set UPLOAD_STORAGE_* FTP settings in laravel/.env (see docs/FTP_UPLOAD.md).
php artisan optimize:clear
php artisan portfolio:preflight
php artisan serve
```

Configure `laravel/.env` first: `DB_CONNECTION=mongodb`, `DATABASE_URL=<secret Atlas URI>`, `MONGODB_DATABASE=<exact Prisma database name>`. For production, use a least-privilege, separate DB/user and set `APP_DEBUG=false`. Never send URLs containing passwords into chat or commit them.

`php -m` must show the `mongodb` extension. CLI and Apache can use different `php.ini` files: check `php --ini` and the web runtime. Composer must install `mongodb/laravel-mongodb`; do not ignore `ext-mongodb` requirements.

## Docker development

```powershell
cd E:\portfolio_backend\laravel
docker compose up -d --build
docker compose exec app php artisan key:generate
docker compose exec app php artisan optimize:clear
docker compose exec app php artisan portfolio:preflight
docker compose exec app php artisan route:list
```

Welcome page: `http://127.0.0.1:8000/` with `php artisan serve`; Docker: `http://localhost:8080/`. Health endpoint: `/api/health`. It returns 503 when MongoDB cannot be reached, without exposing credentials.

**Do not run** `php artisan migrate`, `php artisan db:seed`, `portfolio:import` or `migrate:fresh` against the existing Atlas database. Existing Prisma collections are the source of truth.

Legacy media: existing FTP-hosted files are served from the original asset host; do NOT copy them into Laravel storage. The optional `portfolio:import-assets` command is only for old tracked Git media and is not needed for new FTP uploads. Test FTP uploads live on staging before cutover.
