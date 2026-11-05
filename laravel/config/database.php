<?php

use Illuminate\Support\Str;

return [
    'default' => env('DB_CONNECTION', 'mongodb'),
    'connections' => [
        'mongodb' => [
            'driver' => 'mongodb',
            // A single DATABASE_URL also works in the old Node/Prisma backend.
            // It is configured privately in laravel/.env; never commit credentials.
            'dsn' => env('DATABASE_URL'),
            'database' => env('MONGODB_DATABASE'),
            // Keep nested JSON "id" keys in original Prisma data unchanged.
            'rename_embedded_id_field' => false,
        ],
        // SQLite is retained only for unrelated tooling; domain data uses MongoDB.
        'sqlite' => [
            'driver' => 'sqlite', 'database' => database_path('database.sqlite'),
            'prefix' => '', 'foreign_key_constraints' => true,
        ],
    ],
    'migrations' => 'migrations',
    'redis' => [
        'client' => env('REDIS_CLIENT', 'phpredis'),
        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug(env('APP_NAME', 'laravel'), '_').'_database_'),
        ],
        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
        ],
    ],
];
