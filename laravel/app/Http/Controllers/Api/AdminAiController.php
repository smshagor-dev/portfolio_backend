<?php

namespace App\Http\Controllers\Api;

use App\Models\AiProvider;
use App\Models\AiSettings;
use App\Models\AiTrainingEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Crypt;

class AdminAiController extends Controller
{
    private const PROVIDERS = ['openai', 'deepseek', 'gemini'];

    private function publicProvider(AiProvider $provider): array
    {
        return [
            'id' => $provider->id, 'name' => $provider->name,
            'baseUrl' => $provider->baseUrl, 'isActive' => (bool) $provider->isActive,
            'apiKeyConfigured' => (bool) $provider->apiKey,
            'createdAt' => $provider->createdAt,
        ];
    }

    public function providers(): JsonResponse
    {
        return response()->json([
            'providers' => AiProvider::orderBy('createdAt')->get()->map(fn ($p) => $this->publicProvider($p)),
        ]);
    }

    public function saveProvider(Request $request, string $name): JsonResponse
    {
        abort_unless(in_array($name, self::PROVIDERS, true), 404);
        $data = $request->validate([
            'apiKey' => ['sometimes', 'string', 'max:500'],
            'isActive' => ['sometimes', 'boolean'],
        ]);
        $provider = AiProvider::firstOrNew(['name' => $name]);
        $provider->forceFill([
            'name' => $name,
            'baseUrl' => match ($name) {
                'openai' => 'https://api.openai.com/v1',
                'deepseek' => 'https://api.deepseek.com/v1',
                'gemini' => 'https://generativelanguage.googleapis.com/v1beta',
            },
            'isActive' => (bool) ($data['isActive'] ?? $provider->isActive ?? false),
            'apiKey' => isset($data['apiKey']) ? Crypt::encryptString($data['apiKey']) : ($provider->apiKey ?: ''),
        ])->save();
        return response()->json(['message' => 'Provider updated.', 'provider' => $this->publicProvider($provider)]);
    }

    public function settings(): JsonResponse
    {
        $settings = AiSettings::find(1);
        return response()->json(['settings' => $settings ?: [
            'activeProvider' => 'openai',
            'modelName' => (string) config('services.portfolio_ai.model'),
        ]]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'activeProvider' => ['required', 'in:openai,deepseek,gemini'],
            'modelName' => ['required', 'string', 'max:100'],
        ]);
        $settings = AiSettings::updateOrCreate(['id' => 1], $data);
        return response()->json(['message' => 'AI settings updated.', 'settings' => $settings]);
    }

    public function training(): JsonResponse
    {
        return response()->json([
            'entries' => AiTrainingEntry::orderByDesc('createdAt')->limit(200)->get(),
        ]);
    }

    public function addTraining(Request $request): JsonResponse
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:3000'],
            'answer' => ['required', 'string', 'max:30000'],
            'isActive' => ['sometimes', 'boolean'],
        ]);
        return response()->json(['entry' => AiTrainingEntry::create($data)], 201);
    }

    public function deleteTraining(int $id): JsonResponse
    {
        AiTrainingEntry::findOrFail($id)->delete();
        return response()->json(['message' => 'Training entry deleted.']);
    }
}
