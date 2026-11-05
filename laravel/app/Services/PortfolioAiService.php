<?php

namespace App\Services;

use App\Models\AiProvider;
use App\Models\AiSettings;
use App\Models\AiTrainingEntry;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ResearchPublication;
use App\Services\LegacyCredentialCodec;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class PortfolioAiService
{
    private function context(string $message): string
    {
        $profile = Profile::find(1)?->only(['name', 'profile', 'designation', 'description', 'email', 'github', 'linkedIn']) ?? [];
        $terms = collect(preg_split('/[^\pL\pN]+/u', Str::lower($message)))->filter(fn ($s) => mb_strlen($s) > 3)->unique()->values();
        $projects = Project::orderByDesc('updatedAt')->limit(100)->get(['name', 'description', 'tools', 'role', 'demo']);
        $research = ResearchPublication::where('status', 'published')->orderByDesc('published_date')->limit(80)->get(['title', 'short_summary', 'doi', 'publication_url']);
        $training = AiTrainingEntry::where('is_active', true)->limit(100)->get(['question', 'answer']);
        $score = function ($item) use ($terms): int {
            $text = mb_strtolower(implode(' ', array_filter(array_values($item->toArray()), 'is_string')));
            return $terms->sum(fn ($term) => str_contains($text, $term) ? 1 : 0);
        };
        $selected = [
            'profile' => $profile,
            'projects' => $projects->sortByDesc($score)->take(8)->values()->toArray(),
            'research' => $research->sortByDesc($score)->take(8)->values()->toArray(),
            'training' => $training->sortByDesc($score)->take(8)->values()->toArray(),
        ];
        return Str::limit(json_encode($selected, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 18000, '');
    }

    private function provider(): array
    {
        $settings = AiSettings::find(1);
        $name = strtolower((string) ($settings?->activeProvider ?: 'openai'));
        $provider = AiProvider::where('name', $name)->where('is_active', true)->first();
        // Never send a default OpenAI credential to a different AI provider.
        $key = $provider?->apiKey
            ? LegacyCredentialCodec::aiProviderKey($provider)
            : ($name === 'openai' ? (string) config('services.portfolio_ai.api_key') : '');
        $model = (string) ($settings?->modelName ?: config('services.portfolio_ai.model'));
        $urls = [
            'openai' => 'https://api.openai.com/v1',
            'deepseek' => 'https://api.deepseek.com/v1',
            'gemini' => 'https://generativelanguage.googleapis.com/v1beta',
        ];
        if (!array_key_exists($name, $urls)) {
            throw new \RuntimeException('Unsupported AI provider.');
        }
        if (!$key) {
            throw new \RuntimeException('AI provider is not configured.');
        }
        return [$name, $key, $model, $urls[$name]];
    }

    public function reply(string $message): string
    {
        [$provider, $key, $model, $base] = $this->provider();
        $system = 'You are an assistant for the portfolio owner. Only use grounded context. Do not invent facts or imply you can act for the owner. Context: '.$this->context($message);
        if ($provider === 'gemini') {
            $payload = Http::timeout(30)->withHeaders(['x-goog-api-key' => $key])->post(
                $base.'/models/'.rawurlencode($model).':generateContent', [
                    'systemInstruction' => ['parts' => [['text' => $system]]],
                    'contents' => [['role' => 'user', 'parts' => [['text' => $message]]]],
                    'generationConfig' => ['temperature' => 0.2, 'maxOutputTokens' => 600],
                ]
            )->throw()->json();
            $answer = collect(data_get($payload, 'candidates.0.content.parts', []))->pluck('text')->implode("\n");
        } else {
            $payload = Http::withToken($key)->timeout(30)->post($base.'/chat/completions', [
                'model' => $model, 'temperature' => 0.2, 'max_tokens' => 600,
                'messages' => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $message],
                ],
            ])->throw()->json();
            $answer = (string) data_get($payload, 'choices.0.message.content', '');
        }
        $answer = trim((string) $answer);
        if (!$answer) {
            throw new \RuntimeException('AI response was empty.');
        }
        return $answer;
    }
}
