<?php

use Monolog\Handler\NullHandler;
use Monolog\Handler\StreamHandler;

return [
    'default' => env('LOG_CHANNEL', 'stack'),
    'deprecations' => ['channel' => env('LOG_DEPRECATIONS_CHANNEL', 'null'), 'trace' => env('LOG_DEPRECATIONS_TRACE', false)],
    'channels' => [
        'stack' => ['driver' => 'stack', 'channels' => explode(',', (string) env('LOG_STACK', 'single')), 'ignore_exceptions' => false],
        'single' => ['driver' => 'single', 'path' => storage_path('logs/laravel.log'), 'level' => env('LOG_LEVEL', 'debug'), 'replace_placeholders' => true],
        'daily' => ['driver' => 'daily', 'path' => storage_path('logs/laravel.log'), 'level' => env('LOG_LEVEL', 'debug'), 'days' => env('LOG_DAILY_DAYS', 14)],
        'stderr' => ['driver' => 'monolog', 'level' => env('LOG_LEVEL', 'debug'), 'handler' => StreamHandler::class, 'with' => ['stream' => 'php://stderr']],
        'null' => ['driver' => 'monolog', 'handler' => NullHandler::class],
    ],
];
