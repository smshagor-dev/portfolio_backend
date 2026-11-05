<?php

namespace Tests\Feature;

use App\Services\LegacyFtpStorage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;
use Tests\TestCase;

class LegacyFtpStorageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (!extension_loaded('ftp')) {
            $this->markTestSkipped('FTP extension required');
        }
        Storage::fake('ftp_public');
        Storage::fake('ftp_private');
        Storage::fake('public');
        config()->set('filesystems.default', 'ftp_public');
        config()->set('filesystems.disks.ftp_public.host', 'ftp.example.test');
        config()->set('filesystems.disks.ftp_public.username', 'test-user');
        config()->set('filesystems.disks.ftp_public.password', 'test-password');
        config()->set('filesystems.disks.ftp_public.url', 'https://assets.example.test/content');
        config()->set('filesystems.disks.ftp_public.root', 'public_html');
        config()->set('filesystems.disks.ftp_private.root', 'private_storage');
    }

    public function test_public_upload_retains_legacy_path_and_url_without_writing_public_disk(): void
    {
        $file = UploadedFile::fake()->create('Profile Photo.jpg', 2, 'image/jpeg');
        $stored = app(LegacyFtpStorage::class)->uploadPublic($file, 'profile-image');
        $this->assertMatchesRegularExpression(
            '~^/uploads/[0-9]+-profile-photo-[0-9a-f]{8}\.jpg$~',
            $stored['path']
        );
        $this->assertSame('https://assets.example.test'.$stored['path'], $stored['publicUrl']);
        Storage::disk('ftp_public')->assertExists(ltrim($stored['path'], '/'));
        Storage::disk('public')->assertDirectoryEmpty('/');
    }

    public function test_preserved_verification_filename_is_written_to_ftp_root(): void
    {
        $file = UploadedFile::fake()->create('googleabcdef123.html', 1, 'text/html');
        $stored = app(LegacyFtpStorage::class)->uploadPublic($file, 'google-verification', '', true);
        $this->assertSame('/googleabcdef123.html', $stored['path']);
        Storage::disk('ftp_public')->assertExists('googleabcdef123.html');
    }

    public function test_public_upload_fails_closed_when_ftp_not_configured(): void
    {
        config()->set('filesystems.disks.ftp_public.host', null);
        $this->expectException(ServiceUnavailableHttpException::class);
        app(LegacyFtpStorage::class)->uploadPublic(UploadedFile::fake()->create('photo.jpg', 1));
    }

    public function test_private_upload_requires_non_public_ftp_root(): void
    {
        config()->set('filesystems.disks.ftp_private.root', 'public_html/private');
        $this->expectException(ServiceUnavailableHttpException::class);
        app(LegacyFtpStorage::class)->uploadPrivate(UploadedFile::fake()->create('resume.pdf', 2), 'job-cv');
    }

    public function test_private_cv_uses_dedicated_ftp_root(): void
    {
        $path = app(LegacyFtpStorage::class)->uploadPrivate(
            UploadedFile::fake()->create('CV.pdf', 2, 'application/pdf'),
            'job-cv'
        );
        $this->assertStringStartsWith('job-cv/', $path);
        Storage::disk('ftp_private')->assertExists($path);
        Storage::disk('ftp_public')->assertMissing($path);
    }

    public function test_unsafe_ftp_delete_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        app(LegacyFtpStorage::class)->deletePublic('/../settings.env');
    }
    public function test_public_media_get_streams_existing_ftp_asset_without_local_storage(): void
    {
        Storage::disk('ftp_public')->put('uploads/example-image.png', 'safe-png-test-data');
        $response = $this->get('/uploads/example-image.png');
        $response->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->assertSame('safe-png-test-data', $response->streamedContent());
        Storage::disk('public')->assertMissing('uploads/example-image.png');
    }

    public function test_public_media_get_returns_404_for_missing_asset(): void
    {
        $this->get('/uploads/not-found.png')->assertNotFound();
    }

    public function test_public_media_get_blocks_php_files(): void
    {
        Storage::disk('ftp_public')->put('uploads/executable.php', '<?php echo "unexpected";');
        $this->get('/uploads/executable.php')->assertNotFound();
    }

}
