<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json([
    'message' => 'Portfolio Laravel API',
    'api' => '/api',
]));
