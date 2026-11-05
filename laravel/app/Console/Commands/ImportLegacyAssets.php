<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class ImportLegacyAssets extends Command
{
    protected $signature = 'portfolio:import-assets {--commit : Copy reviewed assets into Laravel public/}';
    protected $description = 'Dry-run and safely copy unchanged legacy public images/media from the Express repository';

    private const ALLOWED_EXTENSIONS = [
        'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg', 'pdf', 'ico',
    ];

    private const MAX_FILE_BYTES = 25 * 1024 * 1024;

    public function handle(): int
    {
        $root = is_dir('/var/www/legacy-public') ? '/var/www' : dirname(base_path());
        $sources = ['uploads', 'research'];
        $copy = (bool) $this->option('commit');
        if ($copy && !$this->confirm(
            'Copy eligible files from ../public to laravel/public, without overwriting existing files?',
            false
        )) {
            $this->warn('Cancelled; nothing copied.');
            return self::SUCCESS;
        }

        $candidates = 0;
        $copied = 0;
        $existing = 0;
        $unsafe = 0;
        $sourceFound = false;
        foreach ($sources as $folder) {
            $source = is_dir('/var/www/legacy-public') ? '/var/www/legacy-public/'.$folder : $root.'/public/'.$folder;
            if (!is_dir($source) || is_link($source)) {
                $this->warn('Source missing/skipped: ../public/'.$folder);
                continue;
            }
            $sourceFound = true;
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS)
            );
            foreach ($iterator as $item) {
                if (!$item->isFile() || $item->isLink()) {
                    $unsafe++;
                    continue;
                }
                $relative = str_replace('\\', '/', substr($item->getPathname(), strlen($source) + 1));
                $extension = strtolower(pathinfo($relative, PATHINFO_EXTENSION));
                if (str_contains($relative, '..')
                    || !in_array($extension, self::ALLOWED_EXTENSIONS, true)
                    || $item->getSize() > self::MAX_FILE_BYTES) {
                    $unsafe++;
                    continue;
                }
                if ($extension === 'svg') {
                    // SVG is XML with active-content features. Reject suspicious
                    // markup and serve all copied SVG under a restrictive CSP.
                    $svg = file_get_contents($item->getPathname());
                    if ($svg === false || preg_match(
                        '/<(?:script|foreignObject|iframe|object|embed|a)\b|'
                        .'on[a-z]+\s*=|javascript:|data:text\/html|<\?xml-stylesheet/i',
                        $svg
                    )) {
                        $unsafe++;
                        continue;
                    }
                }
                $destination = public_path($folder.'/'.$relative);
                $candidates++;
                if (file_exists($destination)) {
                    $existing++;
                    continue;
                }
                if ($copy) {
                    File::ensureDirectoryExists(dirname($destination));
                    if (File::copy($item->getPathname(), $destination)) {
                        $copied++;
                    } else {
                        $unsafe++;
                    }
                }
            }
        }

        $this->table(
            ['Eligible', 'Already present', 'Unsafe/skipped', 'Newly copied', 'Mode'],
            [[$candidates, $existing, $unsafe, $copied, $copy ? 'COPY' : 'DRY RUN']]
        );
        if (!$sourceFound) {
            $this->error('Legacy public/ directory not available. Run from a full repository checkout.');
            return self::FAILURE;
        }
        if (!$copy) {
            $this->info('No files were changed. Use --commit to copy after review.');
        }
        $this->warn('Admin-uploaded media stored remotely on FTP requires separate authenticated backup/import.');
        return self::SUCCESS;
    }
}
