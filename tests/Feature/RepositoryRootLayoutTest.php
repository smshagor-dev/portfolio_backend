<?php

namespace Tests\Feature;

use Tests\TestCase;

class RepositoryRootLayoutTest extends TestCase
{
    public function test_laravel_is_the_only_backend_at_repository_root(): void
    {
        foreach ([
            'artisan',
            'composer.json',
            'app/Http/Controllers/Api/AdminAuthController.php',
            'app/Http/Controllers/Api/FounderProjectsController.php',
            'bootstrap/app.php',
            'routes/api.php',
            'public/index.php',
        ] as $path) {
            $this->assertFileExists(base_path($path), $path);
        }

        foreach ([
            'index.js',
            'package.json',
            'api/index.js',
            'prisma/schema.prisma',
            'laravel/artisan',
            'tools/audit-route-parity.js',
            'app/Console/Commands/ImportPortfolioJson.php',
        ] as $path) {
            $this->assertFileDoesNotExist(base_path($path), $path);
        }
    }

    public function test_historical_public_media_are_retained_without_sql_upload(): void
    {
        foreach ([
            'uploads/founder/openmindai-desktop.webp',
            'uploads/founder/openmind-studio-desktop.webp',
            'research/research-publication.svg',
            'googlea7ad0dfb561f0db4.html',
        ] as $asset) {
            $this->assertFileExists(public_path($asset), $asset);
        }

        $this->assertFileDoesNotExist(public_path('uploads/1777603311476-faq.sql'));
        $htaccess = file_get_contents(public_path('.htaccess'));
        $this->assertStringContainsString('RewriteRule ^ index.php [L]', $htaccess);
        $this->assertStringContainsString('Content-Security-Policy', $htaccess);
    }
}
