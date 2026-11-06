<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PortfolioApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_settings_excludes_sensitive_smtp_credentials(): void
    {
        $this->getJson('/api/site/settings')->assertOk()->assertDontSee('smtpPass');
    }

    public function test_home_without_profile_returns_not_found(): void
    {
        $this->getJson('/api/site/home')->assertNotFound();
    }

    public function test_admin_content_is_protected(): void
    {
        $this->postJson('/api/admin/content/projects', ['name' => 'Unsafe'])->assertUnauthorized();
    }

    public function test_public_contact_rejects_empty_payload(): void
    {
        $this->postJson('/api/site/contact', [])->assertUnprocessable();
    }
}
