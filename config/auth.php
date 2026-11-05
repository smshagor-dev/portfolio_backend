<?php

return [
    'defaults' => ['guard' => env('AUTH_GUARD', 'web'), 'passwords' => env('AUTH_PASSWORD_BROKER', 'admins')],
    'guards' => ['web' => ['driver' => 'session', 'provider' => 'admins']],
    'providers' => ['admins' => ['driver' => 'eloquent', 'model' => App\Models\AdminUser::class]],
    'passwords' => ['admins' => ['provider' => 'admins', 'table' => 'password_reset_tokens', 'expire' => 60, 'throttle' => 60]],
    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),
];
