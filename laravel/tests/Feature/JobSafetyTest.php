<?php

namespace Tests\Feature;

use App\Models\AdminUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class JobSafetyTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): void
    {
        $admin = new AdminUser();
        $admin->id = 1;
        $admin->forceFill([
            'name' => 'Admin', 'email' => 'admin@example.test',
            'passwordHash' => Hash::make('SamplePassword123!'),
            'twoFactorEnabled' => false,
        ])->save();
        Sanctum::actingAs($admin, ['admin']);
    }

    public function test_email_send_is_disabled_without_server_opt_in(): void
    {
        $this->admin();
        config()->set('job_agent.allow_sending', false);
        $this->postJson('/api/admin/job-agent/email/send/999')
            ->assertStatus(503)
            ->assertJsonPath('message', 'SMTP sending disabled by server configuration.');
    }

    public function test_company_source_is_saved_disabled_without_crawling(): void
    {
        $this->admin();
        $this->postJson('/api/admin/job-agent/company-sources', [
            'companyName' => 'Sample Company',
            'careersUrl' => 'https://example.com/careers',
            'region' => 'Remote',
        ])->assertCreated()
            ->assertJsonPath('source.enabled', false)
            ->assertJsonPath('source.extractionStatus', 'UNSUPPORTED');
    }
}
