<?php

namespace App\Http\Controllers\Api;

use App\Models\AnalyticsDailyVisit;
use App\Models\AnalyticsPageView;
use App\Models\AnalyticsSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function heartbeat(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sessionId' => ['required', 'string', 'min:8', 'max:128', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'path' => ['sometimes', 'string', 'max:500'],
            'eventType' => ['sometimes', 'string', 'max:50'],
        ]);
        $path = '/'.ltrim(explode('?', (string) ($data['path'] ?? '/'))[0], '/');
        DB::transaction(function () use ($data, $path, $request): void {
            $session = AnalyticsSession::firstOrCreate(['sessionId' => $data['sessionId']], [
                'firstPath' => $path, 'lastPath' => $path,
                'ipAddress' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
                'country' => '', 'region' => '', 'city' => '',
                'userAgent' => substr((string) $request->userAgent(), 0, 2000),
            ]);
            $session->update(['lastPath' => $path, 'lastSeenAt' => now()]);
            AnalyticsDailyVisit::firstOrCreate([
                'sessionRef' => $session->id, 'visitDate' => now()->startOfDay(),
            ], ['path' => $path]);
            $view = AnalyticsPageView::firstOrCreate([
                'sessionRef' => $session->id, 'path' => $path,
            ], ['firstViewedAt' => now(), 'lastViewedAt' => now(), 'viewCount' => 0]);
            $view->increment('viewCount');
            $view->update(['lastViewedAt' => now()]);
        }, 3);
        return response()->json(['success' => true]);
    }
}
