<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApiSecurityHeadersTest extends TestCase
{
    public function test_unknown_api_route_returns_json_and_does_not_cache(): void
    {
        $this->get('/api/not-a-real-endpoint')
            ->assertStatus(404)
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Cache-Control', 'max-age=0, no-store, private');
    }
}
