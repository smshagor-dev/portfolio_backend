<?php

use App\Http\Controllers\Api\AdminAuthController;
use App\Http\Controllers\Api\AdminAiController;
use App\Http\Controllers\Api\BulkContentController;
use App\Http\Controllers\Api\GmailController;
use App\Http\Controllers\Api\AdminResearchController;
use App\Http\Controllers\Api\AdminOperationsController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\FeedbackController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AssistantController;
use App\Http\Controllers\Api\JobAgentController;
use App\Http\Controllers\Api\JobDraftGenerationController;
use App\Http\Controllers\Api\JobIntegrationController;
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
    Route::post('contact', [ContactController::class, 'create'])->middleware('throttle:5,1');
    Route::get('contact-ticket/{messageId}', [ContactController::class, 'show'])->whereNumber('messageId')->middleware('throttle:30,1');
    Route::post('contact-ticket/{messageId}/messages', [ContactController::class, 'reply'])->whereNumber('messageId')->middleware('throttle:10,1');
    Route::get('contact-ticket/{messageId}/files/{chatId}/{field}', [ContactController::class, 'download'])->whereNumber('messageId')->whereNumber('chatId')->middleware('throttle:30,1');
    Route::post('analytics/heartbeat', [AnalyticsController::class, 'heartbeat'])->middleware('throttle:120,1');
    Route::post('testimonials', [FeedbackController::class, 'testimonial'])->middleware('throttle:5,1');
    Route::post('{type}/{slug}/comments', [FeedbackController::class, 'comment'])->whereIn('type', ['projects', 'services', 'articles'])->middleware('throttle:5,1');
    Route::post('{type}/{slug}/comments/{commentId}/replies', [FeedbackController::class, 'reply'])->whereIn('type', ['projects', 'services', 'articles'])->whereNumber('commentId')->middleware('throttle:5,1');
    Route::post('{type}/{slug}/impression', [FeedbackController::class, 'impression'])->whereIn('type', ['projects', 'services', 'articles'])->middleware('throttle:60,1');
    Route::post('articles/{slug}/share', [FeedbackController::class, 'articleShare'])->middleware('throttle:30,1');
});

Route::prefix('research-publications')->group(function (): void {
    Route::get('/', [ResearchController::class, 'index']);
    Route::get('featured', [ResearchController::class, 'featured']);
    Route::get('{slug}', [ResearchController::class, 'show']);
    Route::post('{slug}/impression', [ResearchController::class, 'impression'])->middleware('throttle:60,1');
    Route::post('{slug}/share', [ResearchController::class, 'share'])->middleware('throttle:20,1');
    Route::post('{slug}/comments', fn (\Illuminate\Http\Request $request, string $slug) => app(FeedbackController::class)->comment($request, 'research-publications', $slug))->middleware('throttle:5,1');
    Route::post('{slug}/comments/{commentId}/replies', fn (\Illuminate\Http\Request $request, string $slug, int $commentId) => app(FeedbackController::class)->reply($request, 'research-publications', $slug, $commentId))->whereNumber('commentId')->middleware('throttle:5,1');
});

Route::post('assistant', [AssistantController::class, 'chat'])->middleware('throttle:10,1');

Route::get('admin/job-agent/gmail/callback', [GmailController::class, 'callback'])->middleware('throttle:10,1');

Route::post('admin/login', [AdminAuthController::class, 'login'])->middleware('throttle:5,1');

Route::middleware(['auth:sanctum'])->prefix('admin')->group(function (): void {
    Route::get('me', [AdminAuthController::class, 'me']);
    Route::get('dashboard', [AdminOperationsController::class, 'dashboard']);
    Route::get('ai/providers', [AdminAiController::class, 'providers']);
    Route::put('ai/providers/{name}', [AdminAiController::class, 'saveProvider']);
    Route::get('ai/settings', [AdminAiController::class, 'settings']);
    Route::put('ai/settings', [AdminAiController::class, 'saveSettings']);
    Route::get('ai/training', [AdminAiController::class, 'training']);
    Route::post('ai/training', [AdminAiController::class, 'addTraining']);
    Route::delete('ai/training/{id}', [AdminAiController::class, 'deleteTraining'])->whereNumber('id');
    Route::get('research-publications', [AdminResearchController::class, 'index']);
    Route::get('research-publications/sync-status', [AdminResearchController::class, 'status']);
    Route::post('research-publications/sync', [AdminResearchController::class, 'sync'])->middleware('throttle:2,1');
    Route::get('analytics', [AdminOperationsController::class, 'analytics']);
    Route::get('messages', [AdminOperationsController::class, 'messages']);
    Route::get('messages/{messageId}', [AdminOperationsController::class, 'message'])->whereNumber('messageId');
    Route::post('messages/{messageId}/reply', [AdminOperationsController::class, 'reply'])->whereNumber('messageId');
    Route::patch('messages/{messageId}/status', [AdminOperationsController::class, 'updateStatus'])->whereNumber('messageId');
    Route::delete('messages/{messageId}', [AdminOperationsController::class, 'deleteMessage'])->whereNumber('messageId');
    Route::get('notifications', [AdminOperationsController::class, 'notifications']);
    Route::get('notifications/unread-count', [AdminOperationsController::class, 'unreadCount']);
    Route::patch('notifications/read-all', [AdminOperationsController::class, 'readAll']);
    Route::patch('notifications/{id}/read', [AdminOperationsController::class, 'readOne']);
    Route::delete('notifications/{id}', [AdminOperationsController::class, 'deleteNotification']);
    Route::post('upload-image', [UploadController::class, 'image']);
    Route::post('upload-resume', [UploadController::class, 'resume']);
    Route::post('upload-verification-file', [UploadController::class, 'verification']);
    Route::get('job-agent', [JobAgentController::class, 'index']);
    Route::get('job-agent/overview', [JobAgentController::class, 'overview']);
    Route::get('job-agent/gmail/status', [GmailController::class, 'status']);
    Route::get('job-agent/gmail/auth-url', [GmailController::class, 'connect']);
    Route::get('job-agent/gmail/connect', [GmailController::class, 'connect']);
    Route::post('job-agent/gmail/sync', [GmailController::class, 'sync'])->middleware('throttle:2,1');
    Route::post('job-agent/gmail/disconnect', [GmailController::class, 'disconnect']);
    Route::get('job-agent/jobs', [JobAgentController::class, 'jobs']);
    Route::get('job-agent/jobs/{id}', [JobAgentController::class, 'job'])->whereNumber('id');
    Route::post('job-agent/jobs/{id}/match', [JobDraftGenerationController::class, 'match'])->whereNumber('id');
    Route::get('job-agent/jobs/{id}/contacts', [JobDraftGenerationController::class, 'contacts'])->whereNumber('id');
    Route::post('job-agent/jobs/{id}/generate-draft', [JobDraftGenerationController::class, 'draft'])->whereNumber('id')->middleware('throttle:5,1');
    Route::put('job-agent/drafts/{id}', [JobDraftGenerationController::class, 'update'])->whereNumber('id');
    Route::get('job-agent/matches', [JobAgentController::class, 'matches']);
    Route::get('job-agent/drafts', [JobAgentController::class, 'drafts']);
    Route::get('job-agent/sources', [JobAgentController::class, 'sources']);
    Route::post('job-agent/sources', [JobIntegrationController::class, 'addSource']);
    Route::put('job-agent/sources/{id}', [JobIntegrationController::class, 'updateSource'])->whereNumber('id');
    Route::post('job-agent/sources/{id}/sync', [JobIntegrationController::class, 'syncSource'])->whereNumber('id')->middleware('throttle:5,1');
    Route::post('job-agent/contacts', [JobIntegrationController::class, 'addContact']);
    Route::post('job-agent/contacts/{id}/approve', [JobIntegrationController::class, 'approveContact'])->whereNumber('id');
    Route::get('job-agent/search/preferences', [JobAgentController::class, 'preferences']);
    Route::post('job-agent/jobs/manual', [JobAgentController::class, 'manualJob']);
    Route::post('job-agent/jobs/{id}/draft', [JobAgentController::class, 'createDraft'])->whereNumber('id');
    Route::post('job-agent/drafts/{id}/approve', [JobAgentController::class, 'approve'])->whereNumber('id');
    Route::post('job-agent/drafts/{id}/reject', [JobAgentController::class, 'reject'])->whereNumber('id');
    Route::post('job-agent/email/send/{id}', [JobIntegrationController::class, 'send'])->whereNumber('id');
    Route::put('me', [AdminAuthController::class, 'updateMe']);
    Route::put('me/password', [AdminAuthController::class, 'updatePassword']);
    Route::post('logout', [AdminAuthController::class, 'logout']);
    Route::get('2fa/setup', [AdminAuthController::class, 'twoFactorSetup']);
    Route::post('2fa/enable', [AdminAuthController::class, 'twoFactorEnable'])->middleware('throttle:5,1');
    Route::post('2fa/disable', [AdminAuthController::class, 'twoFactorDisable'])->middleware('throttle:5,1');

    Route::get('legal-pages', [ContentController::class, 'legalPages']);
    Route::put('legal-pages', [ContentController::class, 'updateLegalPages']);
    Route::put('profile', [ContentController::class, 'updateProfile']);
    Route::put('content', [BulkContentController::class, 'update']);

    Route::get('content/{resource}', [ContentController::class, 'index']);
    Route::get('content/{resource}/{id}', [ContentController::class, 'show'])->whereNumber('id');
    Route::post('content/{resource}', [ContentController::class, 'store']);
    Route::put('content/{resource}/{id}', [ContentController::class, 'update'])->whereNumber('id');
    Route::delete('content/{resource}/{id}', [ContentController::class, 'destroy'])->whereNumber('id');
});
