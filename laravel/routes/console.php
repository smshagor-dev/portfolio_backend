<?php

use App\Models\AdminUser;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

Artisan::command('portfolio:admin {email} {name}', function (): void {
    $email = strtolower(trim($this->argument('email')));
    $name = trim($this->argument('name'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !$name) {
        $this->error('Valid email and name are required.');
        return;
    }
    $password = $this->secret('Admin password (minimum 12 characters)');
    if (!$password || strlen($password) < 12) {
        $this->error('Password must contain at least 12 characters.');
        return;
    }
    $admin = AdminUser::firstOrNew(['email' => $email]);
    $admin->forceFill([
        'name' => $name, 'email' => $email, 'passwordHash' => Hash::make($password),
        'twoFactorEnabled' => false, 'twoFactorSecret' => null,
    ])->save();
    $this->info('Admin account saved. Enable 2FA after login.');
})->purpose('Create or reset a portfolio admin interactively');

Artisan::command('portfolio:status', function (): void {
    $this->info('Laravel 12 MySQL portfolio backend installed.');
});
