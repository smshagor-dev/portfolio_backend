<?php

return [
    'portfolio_ai' => [
        'api_key' => env('PORTFOLIO_AI_API_KEY'),
        // Only for decrypting previously stored Node AES-256-GCM provider keys.
        // On first successful read they are re-encrypted with Laravel APP_KEY.
        'legacy_encryption_secret' => env('AI_ENCRYPTION_KEY') ?: env('ADMIN_JWT_SECRET'),
        'base_url' => env('PORTFOLIO_AI_BASE_URL', 'https://api.openai.com/v1'),
        'model' => env('PORTFOLIO_AI_MODEL', 'gpt-4o-mini'),
    ],
    'gmail' => [
        'client_id' => env('GMAIL_CLIENT_ID'),
        'client_secret' => env('GMAIL_CLIENT_SECRET'),
        'redirect_uri' => env('GMAIL_REDIRECT_URI'),
        'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000'),
    ],
];
