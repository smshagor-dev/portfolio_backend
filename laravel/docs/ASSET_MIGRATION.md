# Legacy public asset migration

The old Express repository has tracked media under:
- public/uploads/ (including nested founder and job-agent folders)
- public/research/

Laravel needs identical URL paths (/uploads/.. and /research/..) for existing frontend references to keep working. The migration command is deliberately non-destructive and requires a full checkout containing the old Node project.

From laravel/ after installing dependencies:

    php artisan portfolio:import-assets
    php artisan portfolio:import-assets --commit

The first run shows counts and copies nothing. The second run requests confirmation and copies accepted assets into laravel/public/ without overwriting existing files.

Only common public media types are copied; active SVG content, symlinks, hidden source directories, executable extensions and files over 25 MiB are rejected. Restrictive SVG CSP and executable denial are configured for the provided Nginx deployment.

IMPORTANT: Old backend FTP/public user uploads may exist outside Git and are NOT included here. Back them up through the original hosting account and migrate separately. Never import the old SQL dump or expose .env, database exports or credential files through the public folder.

Google site verification HTML is not copied automatically. It must be reviewed and configured manually.
