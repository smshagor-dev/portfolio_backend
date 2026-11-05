<?php

use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');
Route::get('/health', [\App\Http\Controllers\Api\StatusController::class, 'health']);
Route::get('/ready', [\App\Http\Controllers\Api\StatusController::class, 'health']);
