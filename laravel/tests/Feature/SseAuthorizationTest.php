<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SseAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_realtime_stream_rejects_anonymous_users(): void
    {
        $this->get('/api/admin/live-events')->assertUnauthorized();
    }

    public function test_ticket_realtime_stream_requires_a_valid_secret(): void
    {
        $this->get('/api/site/contact-ticket/123/events')->assertNotFound();
    }
}
