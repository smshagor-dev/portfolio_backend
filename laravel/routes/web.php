<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json([
    'message' => 'Portfolio Laravel API',
    'api' => '/api',
]));

Route::get('/health', [\App\Http\Controllers\Api\StatusController::class, 'health']);
Route::get('/ready', [\App\Http\Controllers\Api\StatusController::class, 'health']);
