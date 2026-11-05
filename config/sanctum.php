<?php

return [
    'stateful' => array_filter(array_map('trim', explode(',', (string) env('SANCTUM_STATEFUL_DOMAINS', 'localhost,127.0.0.1')))),
    'guard' => ['web'],
    'expiration' => (int) env('ADMIN_TOKEN_EXPIRATION_MINUTES', 10080),
    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),
    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],
];
