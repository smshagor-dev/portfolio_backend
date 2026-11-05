<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

class Preflight extends Command
{
    protected $signature = 'portfolio:preflight {--strict : Require a lockfile and all required runtime settings} {--check-ftp : Read-only FTP connectivity check}';
    protected $description = 'Read-only PHP 8.2, MongoDB Atlas and API configuration audit';

    public function handle(): int
    {
        $failures = 0;
        $this->info('Laravel MongoDB preflight (read-only)');
        $checks = [
            'PHP >= 8.2' => PHP_VERSION_ID >= 80200,
            'MongoDB extension' => extension_loaded('mongodb'),
            'FTP extension' => extension_loaded('ftp'),
            'FTP package' => class_exists(\League\Flysystem\Ftp\FtpAdapter::class),
            'FTP-only uploads' => config('filesystems.default') === 'ftp_public',
            'FTP server credentials configured' => (bool) config('filesystems.disks.ftp_public.host')
                && (bool) config('filesystems.disks.ftp_public.username')
                && (bool) config('filesystems.disks.ftp_public.password'),
            'FTP public URL' => filter_var(
                (string) config('filesystems.disks.ftp_public.url'), FILTER_VALIDATE_URL
            ) !== false,
            'mbstring' => extension_loaded('mbstring'),
            'OpenSSL' => extension_loaded('openssl'),
            'zip' => extension_loaded('zip'),
            'APP_KEY' => (bool) config('app.key'),
            'MongoDB driver selected' => config('database.default') === 'mongodb',
            'DATABASE_URL is set' => (bool) config('database.connections.mongodb.dsn'),
            'MONGODB_DATABASE is set' => !in_array(
                config('database.connections.mongodb.database'),
                ['', null, 'REPLACE_WITH_EXISTING_DATABASE_NAME'], true
            ),
            'Storage writable' => is_writable(storage_path()),
            'Cache writable' => is_writable(base_path('bootstrap/cache')),
            'API routes loaded' => count(Route::getRoutes()) >= 100,
        ];
        if ($this->option('strict')) {
            $checks['composer.lock'] = is_file(base_path('composer.lock'));
        }
        foreach ($checks as $name => $valid) {
            $this->line(($valid ? '<info>PASS</info> ' : '<error>FAIL</error> ').$name);
            if (!$valid) $failures++;
        }

        if ($checks['MongoDB extension'] && $checks['DATABASE_URL is set']
            && $checks['MONGODB_DATABASE is set']) {
            try {
                DB::connection('mongodb')->getMongoClient()
                    ->selectDatabase(config('database.connections.mongodb.database'))
                    ->command(['ping' => 1])->toArray();
                $this->info('PASS Atlas connection and database ping');
            } catch (\Throwable $e) {
                // No credentials or driver error contents printed to CLI.
                report($e);
                $this->error('FAIL MongoDB ping. Check URI, Atlas IP access, DNS and credentials.');
                $failures++;
            }
        }

        if ($this->option('check-ftp')) {
            if (!$checks['FTP extension'] || !$checks['FTP package']
                || !$checks['FTP server credentials configured']) {
                $this->error('FAIL FTP connectivity check requires PHP ext-ftp and configured FTP disk');
                $failures++;
            } else {
                try {
                    // Listing the configured root is read-only; no test file is uploaded.
                    Storage::disk('ftp_public')->directories('');
                    $this->info('PASS remote FTP login and directory listing');
                } catch (\Throwable $e) {
                    logger()->error('Preflight FTP connectivity failed', ['type' => get_class($e)]);
                    $this->error('FAIL FTP connection. Check host, login, TLS, base directory and firewall.');
                    $failures++;
                }
            }
        }

        if (config('app.env') === 'production' && config('app.debug')) {
            $this->error('FAIL APP_DEBUG must be false in production');
            $failures++;
        }
        if (config('job_agent.allow_sending')) {
            $this->warn('Outbound SMTP is enabled; verify explicit recipient approval first.');
        }
        $this->line('Failed checks: '.$failures);
        return $failures ? self::FAILURE : self::SUCCESS;
    }
}
