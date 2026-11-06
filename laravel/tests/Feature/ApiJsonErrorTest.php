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

    public function test_blank_optional_two_factor_code_does_not_fail_string_validation(): void
    {
        // Laravel converts "" into null before validating. The invalid email
        // ensures this test never queries the real admin database.
        $this->postJson('/api/admin/login', [
            'email' => 'not-an-email',
            'password' => '',
            'twoFactorCode' => '',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password'])
            ->assertJsonMissingValidationErrors(['twoFactorCode']);
    }

    public function test_explicit_null_optional_two_factor_code_is_accepted_by_validator(): void
    {
        $this->postJson('/api/admin/login', [
            'email' => 'not-an-email',
            'password' => '',
            'twoFactorCode' => null,
        ])->assertStatus(422)
            ->assertJsonMissingValidationErrors(['twoFactorCode']);
    }

    public function test_numeric_two_factor_code_is_rejected(): void
    {
        $this->postJson('/api/admin/login', [
            'email' => 'not-an-email',
            'password' => '',
            'twoFactorCode' => 123456,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['twoFactorCode']);
    }

    public function test_unknown_api_routes_respond_with_json(): void
    {
        $response = $this->get('/api/__not_a_route__', ['Accept' => 'text/html']);
        $response->assertStatus(404)
            ->assertHeader('Content-Type', 'application/json');
    }
}
