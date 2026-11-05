<?php

namespace Tests\Feature;

use App\Models\AdminUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentValidationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $user = new AdminUser();
        $user->forceFill([
            'name' => 'Test administrator', 'email' => 'admin@example.test',
            'passwordHash' => Hash::make('ValidPassword123!'),
            'twoFactorEnabled' => false,
        ])->save();
        Sanctum::actingAs($user, ['admin']);
    }

    public function test_project_creation_rejects_incomplete_payload(): void
    {
        $this->postJson('/api/admin/content/projects', ['name' => 'Incomplete'])
            ->assertUnprocessable();
    }

    public function test_project_creation_accepts_json_skills_and_adds_required_defaults(): void
    {
        $this->postJson('/api/admin/content/projects', [
            'name' => 'Secure Portfolio Project',
            'description' => 'A documented project',
            'tools' => ['Laravel', 'MySQL'],
        ])->assertCreated()->assertJsonPath('data.role', '');

        $this->assertDatabaseHas('projects', ['name' => 'Secure Portfolio Project']);
    }

    public function test_research_publication_needs_publish_date_and_valid_url(): void
    {
        $this->postJson('/api/admin/research-publications', [
            'title' => 'A research work', 'publicationUrl' => 'javascript:alert(1)',
        ])->assertUnprocessable();
    }
}
