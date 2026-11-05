<?php

use App\Http\Controllers\Api\AdminAuthController;
use App\Http\Controllers\Api\ContentController;
use App\Http\Controllers\Api\PublicSiteController;
use App\Http\Controllers\Api\ResearchController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'message' => 'server ready']));

Route::prefix('site')->group(function (): void {
    Route::get('home', [PublicSiteController::class, 'home']);
    Route::get('settings', [PublicSiteController::class, 'settingsJson']);
    Route::get('pricing', [PublicSiteController::class, 'pricings']);
    Route::get('pricing/{slug}', [PublicSiteController::class, 'pricing']);
    Route::get('projects/{slug}', [PublicSiteController::class, 'project']);
    Route::get('services', [PublicSiteController::class, 'services']);
    Route::get('services/{slug}', [PublicSiteController::class, 'service']);
    Route::get('articles', [PublicSiteController::class, 'articles']);
    Route::get('articles/{slug}', [PublicSiteController::class, 'article']);
    Route::get('blogs', [PublicSiteController::class, 'blogs']);
});

Route::prefix('research-publications')->group(function (): void {
    Route::get('/', [ResearchController::class, 'index']);
    Route::get('featured', [ResearchController::class, 'featured']);
    Route::get('{slug}', [ResearchController::class, 'show']);
    Route::post('{slug}/impression', [ResearchController::class, 'impression'])->middleware('throttle:60,1');
    Route::post('{slug}/share', [ResearchController::class, 'share'])->middleware('throttle:20,1');
});

Route::post('admin/login', [AdminAuthController::class, 'login'])->middleware('throttle:5,1');

Route::middleware(['auth:sanctum'])->prefix('admin')->group(function (): void {
    Route::get('me', [AdminAuthController::class, 'me']);
    Route::put('me', [AdminAuthController::class, 'updateMe']);
    Route::put('me/password', [AdminAuthController::class, 'updatePassword']);
    Route::post('logout', [AdminAuthController::class, 'logout']);
    Route::get('2fa/setup', [AdminAuthController::class, 'twoFactorSetup']);
    Route::post('2fa/enable', [AdminAuthController::class, 'twoFactorEnable'])->middleware('throttle:5,1');
    Route::post('2fa/disable', [AdminAuthController::class, 'twoFactorDisable'])->middleware('throttle:5,1');

    Route::get('legal-pages', [ContentController::class, 'legalPages']);
    Route::put('legal-pages', [ContentController::class, 'updateLegalPages']);
    Route::put('profile', [ContentController::class, 'updateProfile']);

    Route::get('content/{resource}', [ContentController::class, 'index']);
    Route::get('content/{resource}/{id}', [ContentController::class, 'show'])->whereNumber('id');
    Route::post('content/{resource}', [ContentController::class, 'store']);
    Route::put('content/{resource}/{id}', [ContentController::class, 'update'])->whereNumber('id');
    Route::delete('content/{resource}/{id}', [ContentController::class, 'destroy'])->whereNumber('id');
});
