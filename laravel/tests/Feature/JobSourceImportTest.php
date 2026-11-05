<?php

namespace Tests\Feature;

use App\Models\JobBoardSource;
use App\Models\JobPost;
use App\Services\JobSourceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class JobSourceImportTest extends TestCase
{
    use RefreshDatabase;

    private function source(string $url, bool $enabled): JobBoardSource
    {
        return JobBoardSource::create([
            'sourceName' => 'Example Company',
            'companyName' => 'Example Company',
            'region' => 'Global',
            'sourceType' => 'COMPANY_CAREER_SITE',
            'baseUrl' => $url,
            'careersUrl' => 'https://jobs.lever.co/exampleco',
            'enabled' => $enabled,
        ]);
    }

    public function test_disabled_job_source_cannot_trigger_external_requests(): void
    {
        Http::fake();
        $source = $this->source('https://api.lever.co/v0/postings/exampleco?mode=json', false);
        try {
            app(JobSourceService::class)->sync($source);
            $this->fail('Disabled source must not be fetched.');
        } catch (\InvalidArgumentException $exception) {
            $this->assertSame('Job source must be enabled before synchronization.', $exception->getMessage());
        }
        Http::assertNothingSent();
    }

    public function test_arbitrary_https_host_is_rejected_before_request(): void
    {
        Http::fake();
        $source = $this->source('https://example.com/collect/jobs', true);
        try {
            app(JobSourceService::class)->sync($source);
            $this->fail('Unapproved host must not be fetched.');
        } catch (\InvalidArgumentException $exception) {
            $this->assertSame('Only approved HTTPS job provider APIs are supported.', $exception->getMessage());
        }
        Http::assertNothingSent();
    }

    public function test_verified_lever_api_imports_jobs_without_duplicate_records(): void
    {
        $url = 'https://api.lever.co/v0/postings/exampleco?mode=json';
        Http::fake([$url => Http::response([[
            'text' => 'Backend Engineer',
            'hostedUrl' => 'https://jobs.lever.co/exampleco/role-123',
            'descriptionPlain' => 'Build robust production APIs in PHP.',
            'categories' => ['location' => 'Remote'],
        ]], 200)]);

        $source = $this->source($url, true);
        $first = app(JobSourceService::class)->sync($source);
        $second = app(JobSourceService::class)->sync($source);

        $this->assertSame(1, $first['importedCount']);
        $this->assertSame(0, $second['importedCount']);
        $this->assertSame(1, $second['duplicateCount']);
        $this->assertDatabaseCount('job_posts', 1);
        $this->assertDatabaseHas('job_posts', [
            'title' => 'Backend Engineer',
            'company' => 'Example Company',
            'descriptionStatus' => 'READY',
        ]);
    }
}
