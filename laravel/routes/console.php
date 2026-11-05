<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('portfolio:status', function (): void {
    $this->info('Laravel portfolio backend is installed.');
})->purpose('Show the Laravel migration status');
