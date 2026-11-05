<?php

namespace App\Http\Controllers\Api;

use App\Models\ResearchPublication;
use App\Services\ResearchSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class AdminResearchController extends Controller
{
    public function index(ResearchSyncService $service): JsonResponse
    {
        return response()->json([
            'success' => true, 'message' => 'Research publications loaded.',
            'data' => ResearchPublication::orderByDesc('published_date')->limit(300)->get(),
            'sync' => $service->status(),
            'mode' => 'orcid-crossref',
        ]);
    }

    public function status(ResearchSyncService $service): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Sync status loaded.', 'data' => $service->status()]);
    }

    public function sync(ResearchSyncService $service): JsonResponse
    {
        try {
            $result = $service->sync();
            return response()->json([
                'success' => true, 'message' => 'Research sync completed.',
                'data' => $result, 'sync' => $service->status(),
            ]);
        } catch (\Throwable $exception) {
            report($exception);
            return response()->json(['success' => false, 'message' => 'Research sync failed.', 'data' => null], 502);
        }
    }
}
