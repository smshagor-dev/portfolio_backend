<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApiJsonErrorTest extends TestCase
{
    public function test_admin_login_validation_always_responds_with_json(): void
    {
        // Explicitly request HTML to confirm an API validation exception
        // cannot return Laravel's default HTML exception page.
        $response = $this->post('/api/admin/login', [], ['Accept' => 'text/html']);

        $response->assertStatus(422)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_unknown_api_routes_respond_with_json(): void
    {
        $response = $this->get('/api/__not_a_route__', ['Accept' => 'text/html']);
        $response->assertStatus(404)
            ->assertHeader('Content-Type', 'application/json');
    }
}
