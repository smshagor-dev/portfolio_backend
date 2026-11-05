<?php

namespace App\Http\Controllers\Api;

use App\Services\GmailJobAlertService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class GmailController extends Controller
{
    public function status(GmailJobAlertService $gmail): JsonResponse
    {
        return response()->json($gmail->status());
    }

    public function connect(Request $request, GmailJobAlertService $gmail): JsonResponse
    {
        try {
            return response()->json(['authUrl' => $gmail->authorizationUrl((int) $request->user()->id)]);
        } catch (\Throwable $error) {
            return response()->json(['message' => 'Google OAuth is not configured.'], 503);
        }
    }

    public function callback(Request $request, GmailJobAlertService $gmail)
    {
        $base = rtrim((string) config('services.gmail.frontend_url'), '/');
        try {
            $request->validate(['state' => ['required', 'string'], 'code' => ['required', 'string']]);
            $gmail->exchange((string) $request->query('state'), (string) $request->query('code'));
            return redirect()->away($base.'/admin/job-agent?gmail=connected');
        } catch (\Throwable $error) {
            report($error);
            return redirect()->away($base.'/admin/job-agent?gmail=failed');
        }
    }

    public function sync(GmailJobAlertService $gmail): JsonResponse
    {
        try {
            return response()->json($gmail->sync());
        } catch (\Throwable $error) {
            report($error);
            return response()->json(['message' => 'Gmail sync failed. Review the connection or server logs.'], 502);
        }
    }

    public function disconnect(GmailJobAlertService $gmail): JsonResponse
    {
        $gmail->disconnect();
        return response()->json(['message' => 'Gmail disconnected locally.']);
    }
}
