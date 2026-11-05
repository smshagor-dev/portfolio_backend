<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

class LegacyFtpStorage
{
    /**
     * Mirrors the Node backend: /uploads/{timestamp}-{safe-name}-{random}.{ext}
     * and an absolute URL based on UPLOAD_STORAGE_PUBLIC_BASE_URL.
     */
    public function uploadPublic(
        UploadedFile $file,
        string $fallbackName = 'file',
        string $directory = 'uploads',
        bool $preserveOriginalName = false
    ): array {
        $this->assertPublicReady();
        if (!in_array($directory, ['uploads', ''], true)) {
            throw new \InvalidArgumentException('Unsupported FTP upload folder.');
        }

        $filename = $this->filename($file->getClientOriginalName(), $fallbackName, $preserveOriginalName);
        $key = $directory === '' ? $filename : $directory.'/'.$filename;
        $this->writeUploadedFile('ftp_public', $key, $file);

        return [
            'path' => '/'.$key,
            'publicUrl' => $this->publicUrl('/'.$key),
        ];
    }

    public function uploadPrivate(UploadedFile $file, string $directory): string
    {
        $this->assertPrivateReady();
        if (!in_array($directory, ['job-cv'], true)) {
            throw new \InvalidArgumentException('Unsupported private FTP upload folder.');
        }
        $key = $directory.'/'.$this->filename($file->getClientOriginalName(), 'cv');
        $this->writeUploadedFile('ftp_private', $key, $file);
        return $key;
    }

    public function putPrivateBytes(string $key, string $bytes): void
    {
        $this->assertPrivateReady();
        if (!preg_match('~^job-cover-letters/[a-zA-Z0-9._-]+\.pdf$~D', $key)) {
            throw new \InvalidArgumentException('Invalid private PDF path.');
        }
        $this->write('ftp_private', $key, $bytes);
    }

    public function privateDisk(): \Illuminate\Contracts\Filesystem\Filesystem
    {
        $this->assertPrivateReady();
        return Storage::disk('ftp_private');
    }

    public function publicDisk(): \Illuminate\Contracts\Filesystem\Filesystem
    {
        $this->assertPublicReady();
        return Storage::disk('ftp_public');
    }

    public function deletePublic(string $path): void
    {
        if ($path === '') return;
        $this->assertPublicReady();
        $key = ltrim($path, '/');
        if (!preg_match('~^uploads/[a-zA-Z0-9._-]+$~D', $key)) {
            throw new \InvalidArgumentException('Unsafe public FTP deletion path.');
        }
        $this->operation('delete', fn () => Storage::disk('ftp_public')->delete($key));
    }

    public function publicUrl(string $path): string
    {
        $this->assertPublicReady();
        $url = (string) config('filesystems.disks.ftp_public.url', '');
        $parts = parse_url($url);
        if (!is_array($parts) || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['https', 'http'], true)
            || empty($parts['host'])) {
            throw new ServiceUnavailableHttpException(null, 'FTP public URL not configured.');
        }
        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
        // Same behaviour as Node's new URL('/uploads/...', baseUrl): ignore base path.
        return $origin.'/'.ltrim($path, '/');
    }

    private function assertPublicReady(): void
    {
        $cfg = config('filesystems.disks.ftp_public', []);
        if ((string) config('filesystems.default') !== 'ftp_public'
            || (string) env('UPLOAD_STORAGE_DRIVER', 'ftp') !== 'ftp'
            || empty($cfg['host']) || empty($cfg['username']) || empty($cfg['password'])
            || empty($cfg['url']) || !extension_loaded('ftp')) {
            throw new ServiceUnavailableHttpException(null, 'FTP upload storage is not configured.');
        }
    }

    private function assertPrivateReady(): void
    {
        $this->assertPublicReady();
        $private = trim((string) config('filesystems.disks.ftp_private.root', ''), '/');
        $public = trim((string) config('filesystems.disks.ftp_public.root', ''), '/');
        if ($private === '' || $private === $public
            || ($public !== '' && str_starts_with($private.'/', $public.'/'))
            || str_contains($private, '..')) {
            throw new ServiceUnavailableHttpException(null, 'Private FTP storage is not configured outside the public root.');
        }
    }

    private function filename(string $original, string $fallback, bool $preserve): string
    {
        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        // Upload endpoints validate MIME and acceptable extensions before this call.
        if (!preg_match('/^[a-z0-9]{1,10}$/D', $ext)) {
            throw new \InvalidArgumentException('Invalid uploaded file extension.');
        }
        $stem = Str::ascii(pathinfo($original, PATHINFO_FILENAME));
        $stem = strtolower(trim((string) preg_replace('/[^a-zA-Z0-9._-]+/', '-', $stem), '-'));
        $stem = substr($stem !== '' ? $stem : $fallback, 0, 80);
        return $preserve
            ? $stem.'.'.$ext
            : (string) floor(microtime(true) * 1000).'-'.$stem.'-'.bin2hex(random_bytes(4)).'.'.$ext;
    }

    private function writeUploadedFile(string $disk, string $key, UploadedFile $file): void
    {
        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false) {
            throw new \RuntimeException('Unable to read uploaded file.');
        }
        try {
            $this->write($disk, $key, $stream);
        } finally {
            fclose($stream);
        }
    }

    private function write(string $disk, string $key, mixed $content): void
    {
        $this->operation('upload', function () use ($disk, $key, $content): void {
            if (!Storage::disk($disk)->put($key, $content)) {
                throw new \RuntimeException('FTP upload returned false.');
            }
        });
    }

    private function operation(string $action, callable $fn): mixed
    {
        try {
            return $fn();
        } catch (\Throwable $e) {
            // Do not echo exception messages: underlying FTP errors may contain host/user data.
            logger()->error('FTP '.$action.' failed', ['exception_type' => get_class($e)]);
            throw new ServiceUnavailableHttpException(null, 'Remote FTP storage is unavailable.');
        }
    }
}
