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

    public function test_legacy_bcryptjs_hashes_can_log_in_and_are_rehashed(): void
    {
        foreach (['$2a$', '$2b$'] as $index => $prefix) {
            $legacyHash = $prefix.substr(Hash::make('TestPassword123!'), 4);
            $admin = new AdminUser();
            $admin->id = $index + 100;
            $admin->forceFill([
                'name' => 'Legacy Admin',
                'email' => 'legacy'.$index.'@example.test',
                'passwordHash' => $legacyHash,
                'twoFactorEnabled' => false,
            ])->save();

            $this->postJson('/api/admin/login', [
                'email' => $admin->email,
                'password' => 'TestPassword123!',
            ])->assertOk()->assertJsonStructure(['token', 'admin']);

            $updatedHash = $admin->fresh()->passwordHash;
            $this->assertStringStartsWith('$2y$', $updatedHash);
            $this->assertTrue(Hash::check('TestPassword123!', $updatedHash));
        }
    }

    public function test_invalid_or_unsupported_hashes_return_unauthorized_without_exception(): void
    {
        foreach (['not-a-bcrypt-hash', null] as $index => $invalidHash) {
            $admin = new AdminUser();
            $admin->id = $index + 200;
            $admin->forceFill([
                'name' => 'Invalid Admin',
                'email' => 'invalid'.$index.'@example.test',
                'passwordHash' => $invalidHash,
                'twoFactorEnabled' => false,
            ])->save();

            $this->postJson('/api/admin/login', [
                'email' => $admin->email,
                'password' => 'TestPassword123!',
            ])->assertUnauthorized();
        }
    }

    public function test_wrong_password_does_not_rehash_legacy_hash(): void
    {
        $legacyHash = '$2b$'.substr(Hash::make('TestPassword123!'), 4);
        $admin = new AdminUser();
        $admin->id = 300;
        $admin->forceFill([
            'name' => 'Legacy Admin',
            'email' => 'wrong-password@example.test',
            'passwordHash' => $legacyHash,
            'twoFactorEnabled' => false,
        ])->save();

        $this->postJson('/api/admin/login', [
            'email' => $admin->email,
            'password' => 'WrongPassword123!',
        ])->assertUnauthorized();

        $this->assertSame($legacyHash, $admin->fresh()->passwordHash);
    }

    public function test_legacy_hash_is_not_rehashed_before_two_factor_verification(): void
    {
        $legacyHash = '$2b$'.substr(Hash::make('TestPassword123!'), 4);
        $admin = new AdminUser();
        $admin->id = 400;
        $admin->forceFill([
            'name' => '2FA Admin',
            'email' => '2fa-legacy@example.test',
            'passwordHash' => $legacyHash,
            'twoFactorEnabled' => true,
        ])->save();

        $this->postJson('/api/admin/login', [
            'email' => $admin->email,
            'password' => 'TestPassword123!',
        ])->assertOk()->assertJsonPath('requiresTwoFactor', true);

        $this->assertSame($legacyHash, $admin->fresh()->passwordHash);
    }

    public function test_password_change_accepts_legacy_bcryptjs_hash(): void
    {
        $legacyHash = '$2b$'.substr(Hash::make('TestPassword123!'), 4);
        $admin = new AdminUser();
        $admin->id = 500;
        $admin->forceFill([
            'name' => 'Legacy Admin',
            'email' => 'password-change@example.test',
            'passwordHash' => $legacyHash,
            'twoFactorEnabled' => false,
        ])->save();

        \Laravel\Sanctum\Sanctum::actingAs($admin, ['admin']);

        $this->putJson('/api/admin/me/password', [
            'currentPassword' => 'TestPassword123!',
            'newPassword' => 'NewPassword123!',
            'newPassword_confirmation' => 'NewPassword123!',
        ])->assertOk();

        $this->assertTrue(Hash::check('NewPassword123!', $admin->fresh()->passwordHash));
    }
}
