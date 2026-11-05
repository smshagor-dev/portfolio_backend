<?php

namespace Tests\Feature;

use App\Models\JobBoardSource;
use App\Services\JobSourceService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CompanySourceProbeTest extends TestCase
{
    public function test_approved_greenhouse_api_can_be_probed_without_importing_jobs(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'boards-api.greenhouse.io/*' => Http::response([
                'jobs' => [['id' => 123, 'title' => 'Software Engineer']],
            ], 200),
        ]);
        $source = new JobBoardSource();
        $source->careersUrl = 'https://boards.greenhouse.io/exampleco';
        $source->baseUrl = 'https://boards-api.greenhouse.io/v1/boards/exampleco/jobs?content=true';
        $result = (new JobSourceService())->probeCompany($source);
        $this->assertTrue($result['reachable']);
        $this->assertSame(1, $result['availableJobs']);
        Http::assertSentCount(1);
    }

    public function test_unapproved_api_url_is_blocked_without_network_request(): void
    {
        Http::preventStrayRequests();
        Http::fake();
        $source = new JobBoardSource();
        $source->careersUrl = 'https://boards.greenhouse.io/exampleco';
        $source->baseUrl = 'https://untrusted.example/secret';
        try {
            (new JobSourceService())->probeCompany($source);
            $this->fail('Expected URL rejection.');
        } catch (\InvalidArgumentException $error) {
            Http::assertNothingSent();
        }
    }
}
