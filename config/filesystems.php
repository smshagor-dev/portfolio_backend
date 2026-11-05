<?php

// Uses the exact UPLOAD_STORAGE_* settings from the original Express backend.
// There is intentionally no local fallback for uploaded files.
$publicBase = (string) env('UPLOAD_STORAGE_PUBLIC_BASE_URL', '');
$host = env('UPLOAD_STORAGE_FTP_HOST') ?: parse_url($publicBase, PHP_URL_HOST);

$ftpOptions = [
    'driver' => 'ftp',
    'host' => $host,
    'port' => (int) env('UPLOAD_STORAGE_FTP_PORT', 21),
    'username' => env('UPLOAD_STORAGE_FTP_USER'),
    'password' => env('UPLOAD_STORAGE_FTP_PASSWORD'),
    'ssl' => filter_var(env('UPLOAD_STORAGE_FTP_SECURE', false), FILTER_VALIDATE_BOOLEAN),
    'passive' => true,
    'timeout' => 30,
    'throw' => true,
];

return [
    'default' => 'ftp_public',
    'disks' => [
        // Laravel framework internal file operations, not for user uploads.
        'local' => ['driver' => 'local', 'root' => storage_path('app/private'), 'serve' => false, 'throw' => true],
        'ftp_public' => array_merge($ftpOptions, [
            'root' => trim((string) env('UPLOAD_STORAGE_FTP_BASE_DIR', ''), '/'),
            'url' => $publicBase,
        ]),
        // Dedicated non-web-served FTP root for Job Agent CVs and letters.
        // This directory MUST be outside any public web root.
        'ftp_private' => array_merge($ftpOptions, [
            'root' => trim((string) env('UPLOAD_STORAGE_FTP_PRIVATE_BASE_DIR', ''), '/'),
            'visibility' => 'private',
        ]),
    ],
    'links' => [],
];
