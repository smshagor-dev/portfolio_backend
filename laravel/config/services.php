<?php

return [
    'portfolio_ai' => [
        'api_key' => env('PORTFOLIO_AI_API_KEY'),
        'base_url' => env('PORTFOLIO_AI_BASE_URL', 'https://api.openai.com/v1'),
        'model' => env('PORTFOLIO_AI_MODEL', 'gpt-4o-mini'),
    ],
];
