<?php

namespace Tests\Feature;

use Tests\TestCase;

class LegacyStaticAssetsTest extends TestCase
{
    public function test_founder_case_study_images_are_in_laravel_public_directory(): void
    {
        foreach ([
            'uploads/founder/openmind-studio-desktop.webp',
            'uploads/founder/openmindai-desktop.webp',
        ] as $file) {
            $this->assertFileExists(public_path($file));
        }
    }

    public function test_google_ownership_verification_file_is_retained(): void
    {
        $this->assertFileExists(public_path('googlea7ad0dfb561f0db4.html'));
    }

    public function test_apache_front_controller_rewrite_is_present(): void
    {
        $config = file_get_contents(public_path('.htaccess'));
        $this->assertStringContainsString('RewriteRule ^ index.php [L]', $config);
    }
}
