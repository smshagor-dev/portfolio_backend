# Laravel 12 / PHP 8.2 / MongoDB Atlas deployment

**Status: staging candidate, not approved for production cutover.** The existing Express backend on Vercel is unchanged. The PHP backend cannot run by uploading it to a Node.js Vercel function.

## Staging first (cPanel PHP-FPM or VPS)

1. Use a separate staging host/subdomain and an **isolated MongoDB database** or a read-only clone with its own least-privilege Atlas user. Do not point unverified Laravel write endpoints at the live Express database.
2. Confirm hosting provides PHP 8.2+, Composer 2 and both `mongodb` and `ftp` PHP extensions; the extensions must be loaded by the **web PHP-FPM runtime**, not just CLI.
3. Deploy `laravel/` only, with document root pointing to `laravel/public`, never the repo root. Keep `.env`, `vendor`, and `storage/app/private` inaccessible from the web.
4. Install locked dependencies: `composer install --no-dev --optimize-autoloader`. A reviewed `composer.lock` must be generated, committed and tested before a production deploy.
5. Set `.env`: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://your-staging-host.example`, `DB_CONNECTION=mongodb`, `DATABASE_URL` (secret), `MONGODB_DATABASE` (existing test database name), `FRONTEND_URL`, mail settings. Set permissions on `storage/` and `bootstrap/cache`. Run `php artisan key:generate` only on a **fresh** install (never rotate an existing key without a migration plan).
6. Run `php artisan optimize:clear` and `php artisan portfolio:preflight`. Laravel uploads are FTP-only, so `storage:link` is not needed for new uploads. **Do not run old MySQL migration/import commands:** Laravel uses Prisma MongoDB collections directly.
7. Test `/api/health` (200 only when real Atlas ping works), `/api/site/home`, projects, research, admin login, contact tickets, uploads, API contract parity and failure paths.
8. Test representative read/write operations on the **staging DB**, not production. Validate numeric IDs, MongoDB relations, Sanctum token persistence, arrays/dates, transactional workflows and email safeguards.
9. Copy legacy assets from `../public/uploads` and `../public/research` after review with `php artisan portfolio:import-assets` (dry run), then `--commit`. This does **not** download files stored externally on legacy FTP.
10. Before any live frontend API switch, configure the legacy `UPLOAD_STORAGE_*` FTP settings and test the new FTP uploader on staging; verify returned `/uploads/*`, `publicUrl`, public media resolution and remote deletion. Back up remotely uploaded media and verify old `/research/*` URLs. Maintain an Express rollback route until all checks pass.

## Important differences / blockers

- Laravel now has the FTP adapter: `league/flysystem-ftp:^3.0` (requires PHP ext-ftp), supports the legacy `UPLOAD_STORAGE_FTP_*` and `UPLOAD_STORAGE_PUBLIC_BASE_URL` settings, and writes new public files to `/uploads/*` on the remote FTP host. There is no local fallback. See `docs/FTP_UPLOAD.md` for required setup and limits. Remote FTP has not yet been live-tested.
- Existing data, especially uploads and credentials, must not be assumed migrated because Atlas ping succeeds.
- PHP MongoDB classes and Composer metadata have been changed, but complete PHP 8.2 API tests, MongoDB relation/transaction tests, and CI have not been verified; old MySQL-specific CI instructions remain legacy.
- Never commit the Atlas URI or FTP credentials; allowlist staging server egress IP in Atlas, enforce TLS, and rotate compromised keys if any were exposed.
