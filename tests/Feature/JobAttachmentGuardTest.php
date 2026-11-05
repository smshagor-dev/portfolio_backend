<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\AdminUser;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

class JobAttachmentGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_unconfigured_server_rejects_cv_attachment_before_email_send(): void
    {
        $admin = new AdminUser();
        $admin->forceFill([
            'name' => 'Admin', 'email' => 'admin@example.test',
            'passwordHash' => Hash::make('TestPassword123!'),
            'twoFactorEnabled' => false,
        ])->save();
        Sanctum::actingAs($admin);
        config()->set('job_agent.allow_attachments', false);

        $this->postJson('/api/admin/job-agent/email/send/123', [
            'attachCv' => true,
        ])->assertUnprocessable()->assertJsonPath(
            'message', 'Attachments are disabled by server configuration.'
        );
    }
}
