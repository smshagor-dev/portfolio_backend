<?php

namespace Tests\Feature;

use App\Models\AiSettings;
use App\Services\PortfolioAiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiProviderIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_openai_fallback_credential_is_not_sent_to_deepseek(): void
    {
        config()->set('services.portfolio_ai.api_key', 'test-openai-secret');
        config()->set('services.portfolio_ai.model', 'gpt-test');
        AiSettings::create(['activeProvider' => 'deepseek', 'modelName' => 'deepseek-chat']);
        Http::fake();
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('AI provider is not configured.');
        (new PortfolioAiService())->reply('Hello');
        Http::assertNothingSent();
    }
}
