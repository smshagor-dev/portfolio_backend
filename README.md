# Portfolio Backend | Laravel 12, PHP 8.2+, MongoDB Atlas

Laravel is now the ONLY backend at the repository root. The previous Express/Prisma/Node.js application is removed. Its Git-tracked public images, PDFs, and research assets are preserved under public/ with unchanged public URLs.

## Application layout

- app/, routes/, config/, bootstrap/: Laravel application, middleware, controllers, and domain services
- artisan, composer.json, .env.example: root-level Laravel entry points and setup
- public/index.php: HTTP front controller; public/uploads/ and public/research/ contain retained historical assets
- storage/: private framework storage; docs/: deployment and configuration guides
- .github/workflows/laravel-php82.yml: PHP and MongoDB checks from the repository root

## Requirements and installation

PHP 8.2+, Composer 2, PHP extensions mongodb, ftp, mbstring, intl, zip, openssl, bcmath, xml and those required by Composer.

Run from the repository root:

    cp .env.example .env
    # Set DB_CONNECTION=mongodb, DATABASE_URL, MONGODB_DATABASE, existing APP_KEY and FTP settings privately.
    composer install --no-dev --optimize-autoloader
    php artisan optimize:clear
    php artisan portfolio:preflight
    php artisan route:list

Do not overwrite an existing .env or rotate the existing APP_KEY. MongoDB data and existing identities/2FA continue to use the same collections. No npm, Prisma, Express server or Node.js process is required.

## Web security

CRITICAL: Set the web server document root to /absolute/path/to/portfolio_backend/public, NEVER the repository root. Otherwise .env, source files, private data, and vendor dependencies may become publicly accessible. Apache uses public/.htaccess; Docker nginx uses docker/nginx.conf.

## API and uploads

- GET /api/health checks MongoDB access
- GET /api/site/home returns public content
- GET /api/site/founder-projects returns founder case studies
- /api/admin/* uses Laravel Sanctum bearer-token authentication
- New uploaded media still uses configured external FTP; old tracked URLs under /uploads/ and /research/ are retained

Do not run legacy MySQL migrations, Prisma setup or production MongoDB imports. For deployment and verification, read docs/DEPLOYMENT.md, docs/ASSET_MIGRATION.md and docs/FTP_UPLOAD.md.

A rollback branch backup/pre-laravel-root-20261106 preserves the pre-migration repository. This source change does not automatically deploy to cPanel, modify Apache settings, or back up external FTP/Atlas data.
