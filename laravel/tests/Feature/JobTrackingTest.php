<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class JobTrackingTest extends TestCase
{
    use RefreshDatabase;

    public function test_tracking_pixel_does_not_write_events_when_tracking_disabled(): void
    {
        config()->set('job_agent.tracking_enabled', false);
        $this->get('/api/job-agent/track/open/unknown.png')
            ->assertOk()->assertHeader('Content-Type', 'image/png');

        $this->assertDatabaseCount('job_agent_email_events', 0);
    }

    public function test_click_with_unknown_draft_does_not_redirect(): void
    {
        $this->get('/api/job-agent/track/click/unknown?url=https%3A%2F%2Fexample.com')
            ->assertNotFound();
    }
}
