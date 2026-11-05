<?php

namespace App\Http\Controllers;

use App\Services\LegacyFtpStorage;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

class FtpPublicMediaController
{
    /**
     * Serve only legacy public media from the FTP disk.
     * No local copy, no PHP execution, no FTP credentials in responses.
     */
    public function show(string $filename, LegacyFtpStorage $storage): StreamedResponse
    {
        $types = [
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            'ico' => 'image/x-icon',
            'pdf' => 'application/pdf',
            'txt' => 'text/plain; charset=utf-8',
            'doc' => 'application/msword',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        abort_if(str_contains($filename, '..'), 404);
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        abort_unless(isset($types[$extension]), 404);

        $path = 'uploads/'.$filename;
        try {
            $disk = $storage->publicDisk();
            abort_unless($disk->exists($path), 404);
            $stream = $disk->readStream($path);
            if (!is_resource($stream)) {
                abort(503, 'Remote media unavailable.');
            }
        } catch (HttpExceptionInterface $error) {
            throw $error;
        } catch (\Throwable $error) {
            logger()->warning('FTP public media fetch failed', ['exception_type' => get_class($error)]);
            abort(503, 'Remote media unavailable.');
        }

        $headers = [
            'Content-Type' => $types[$extension],
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'public, max-age=86400',
            'Content-Disposition' => (in_array($extension, ['txt', 'doc', 'docx'], true) ? 'attachment' : 'inline')
                .'; filename="'.$filename.'"',
        ];
        if ($extension === 'svg') {
            $headers['Content-Security-Policy'] = "sandbox; script-src 'none'; object-src 'none'; base-uri 'none'";
        }

        return response()->stream(static function () use ($stream): void {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, 200, $headers);
    }
}
