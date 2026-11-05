# Windows PowerShell local setup

Laravel uses a separate MySQL database; the Node/Vercel production backend is not changed.

1. Install Docker Desktop with WSL2 and start Docker Desktop.
2. cd .\laravel
3. Copy-Item .env.example .env
4. Edit .env and replace both example MySQL passwords; leave DB_HOST=mysql.
5. Run each command:

    docker compose up -d --build
    docker compose exec app php artisan key:generate
    docker compose restart app
    docker compose exec app php artisan migrate --force
    docker compose exec app php artisan db:seed
    docker compose exec app php artisan portfolio:admin admin@example.com Administrator
    docker compose exec app php artisan storage:link
    docker compose exec app php artisan route:list
    docker compose exec app php artisan test

6. Open http://localhost:8080/api/health and verify status ok.

For old MongoDB content export, from the repository root with DATABASE_URL configured:

    node laravel/tools/export-prisma.js

The output is laravel/storage/app/imports/portfolio-export.json and includes private personal data. Never commit it. Import dry run and then, only if expected, confirm the import:

    docker compose exec app php artisan portfolio:import portfolio-export.json
    docker compose exec app php artisan portfolio:import portfolio-export.json --commit

The import does not overwrite existing numeric IDs. Credentials/admins are excluded and must be configured separately.

Backend: http://localhost:8080/api
MySQL: 127.0.0.1:3307 (local loopback only)

Debugging:

    docker compose logs --tail=120 app
    docker compose logs --tail=120 mysql
    docker compose exec app php artisan migrate:status

Never run migrate:fresh or db:wipe on the production database. Read docs/API_PARITY.md before frontend switch.

Legacy media (dry-run first, then confirm):

    docker compose exec app php artisan portfolio:import-assets
    docker compose exec app php artisan portfolio:import-assets --commit

The Docker Compose stack mounts the old ../public/ directory read-only at /var/www/legacy-public, so both commands work inside the container. Imported files are copied only into laravel/public, which is backed by a local volume.
