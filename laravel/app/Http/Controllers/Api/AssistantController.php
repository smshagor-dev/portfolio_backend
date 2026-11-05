<?php

namespace App\Http\Controllers\Api;

use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Http;

class AssistantController extends Controller
{
    public function chat(Request $request): JsonResponse
    {
        $input = $request->validate(['message' => ['required', 'string', 'max:4000']]);
        $key = (string) config('services.portfolio_ai.api_key');
        if (!$key) {
            return response()->json(['success' => false, 'message' => 'AI provider not configured.'], 503);
        }
        $profile = Profile::find(1);
        $context = json_encode($profile?->only(['name', 'designation', 'description', 'github', 'linkedIn']) ?? [], JSON_THROW_ON_ERROR);
        try {
            $response = Http::timeout(25)->withToken($key)->acceptJson()
                ->post(rtrim((string) config('services.portfolio_ai.base_url'), '/').'/chat/completions', [
                    'model' => config('services.portfolio_ai.model'),
                    'messages' => [
                        ['role' => 'system', 'content' => 'Answer questions about the portfolio using provided facts. Do not invent details. Profile: '.$context],
                        ['role' => 'user', 'content' => $input['message']],
                    ],
                    'temperature' => 0.2, 'max_tokens' => 400,
                ]);
            $response->throw();
            $answer = trim((string) $response->json('choices.0.message.content', ''));
            return $answer
                ? response()->json(['success' => true, 'answer' => $answer])
                : response()->json(['success' => false, 'message' => 'Empty assistant response.'], 502);
        } catch (\Throwable $error) {
            report($error);
            return response()->json(['success' => false, 'message' => 'Assistant request failed.'], 502);
        }
    }
}
