<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands([__DIR__.'/../app/Console/Commands'])
    ->withMiddleware(function (Middleware $middleware): void {
        // Admin API uses Sanctum bearer tokens, not stateful cookie sessions.
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Always render API failures as JSON, including validation, throttling,
        // authentication and 404/500 errors. This prevents the login UI from
        // attempting to parse an HTML Laravel exception page as JSON.
        $exceptions->shouldRenderJsonWhen(
            fn (\Illuminate\Http\Request $request, \Throwable $e): bool =>
                $request->is('api/*') || $request->expectsJson()
        );
    })
    ->create();
