<?php

namespace Tests\Feature;

use App\Models\AdminUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_admin_profile(): void
    {
        $this->getJson('/api/admin/me')->assertUnauthorized();
    }

    public function test_admin_can_log_in_with_valid_credentials(): void
    {
        $admin = new AdminUser();
        $admin->id = 1;
        $admin->forceFill([
            'name' => 'Admin', 'email' => 'admin@example.test',
            'passwordHash' => Hash::make('TestPassword123!'),
            'twoFactorEnabled' => false,
        ])->save();

        $this->postJson('/api/admin/login', [
            'email' => 'admin@example.test', 'password' => 'TestPassword123!',
        ])->assertOk()->assertJsonStructure(['token', 'admin' => ['id', 'email']]);
    }
}
