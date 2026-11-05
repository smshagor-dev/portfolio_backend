<?php

use App\Models\AdminUser;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

Artisan::command('portfolio:admin {email} {name}', function (): void {
    $email = strtolower(trim($this->argument('email')));
    $name = trim($this->argument('name'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !$name) {
        $this->error('Provide a valid email and non-empty name.');
        return;
    }
    $password = $this->secret('New admin password (minimum 12 characters)');
    if (!$password || strlen($password) < 12) {
        $this->error('Password must contain at least 12 characters.');
        return;
    }
    $admin = AdminUser::firstOrNew(['email' => $email]);
    $admin->forceFill([
        'name' => $name,
        'email' => $email,
        'passwordHash' => Hash::make($password),
        'twoFactorEnabled' => false,
        'twoFactorSecret' => null,
    ])->save();
    $this->info('Admin account saved. Enable 2FA after first login.');
})->purpose('Create or reset a portfolio admin (never seeds a default password)');

Artisan::command('portfolio:status', function (): void {
    $this->info('Portfolio Laravel 12 backend is installed.');
});
