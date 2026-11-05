<?php

use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');
Route::get('/health', [\App\Http\Controllers\Api\StatusController::class, 'health']);
Route::get('/ready', [\App\Http\Controllers\Api\StatusController::class, 'health']);
Route::get('/uploads/{filename}', [\App\Http\Controllers\FtpPublicMediaController::class, 'show'])->where('filename', '[A-Za-z0-9][A-Za-z0-9._-]{0,180}');
