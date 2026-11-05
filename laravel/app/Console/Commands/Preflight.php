<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;

class Preflight extends Command
{
    protected $signature = 'portfolio:preflight {--strict : Require lockfile and exact expected schema before sign-off}';
    protected $description = 'Non-destructive Laravel, PHP and MySQL readiness audit';

    private array $failures = [];
    private array $warnings = [];

    public function handle(): int
    {
        $this->components->info('Portfolio Laravel preflight — read-only');

        $this->check(PHP_VERSION_ID >= 80200, 'PHP runtime >= 8.2', PHP_VERSION);
        foreach (['pdo_mysql', 'mbstring', 'openssl', 'intl', 'zip', 'bcmath', 'dom'] as $extension) {
            $this->check(extension_loaded($extension), 'Extension '.$extension);
        }
        $this->check((bool) config('app.key'), 'APP_KEY configured');
        $this->check((string) config('database.default') === 'mysql', 'MySQL configured');
        $this->check(is_writable(storage_path()), 'storage/ writable');
        $this->check(is_writable(base_path('bootstrap/cache')), 'bootstrap/cache writable');
        $this->check(count(Route::getRoutes()) >= 100, 'At least 100 API/web routes registered', (string) count(Route::getRoutes()));

        $lockFile = is_file(base_path('composer.lock'));
        if ($this->option('strict')) {
            $this->check($lockFile, 'composer.lock present');
        } elseif (!$lockFile) {
            $this->warnings[] = 'No composer.lock: dependency versions are not reproducibly pinned.';
            $this->warn('WARN composer.lock not present');
        }

        try {
            DB::connection('mysql')->select('SELECT 1');
            $this->line('<info>PASS</info> MySQL connection');

            $expected = [
                'profiles', 'skills', 'experiences', 'educations', 'stats_counters', 'achievements',
                'service_sections', 'services', 'service_comments', 'service_replies', 'projects',
                'project_comments', 'project_replies', 'pricings', 'faqs', 'testimonials',
                'articles', 'research_publications', 'research_comments', 'research_replies',
                'article_comments', 'article_replies', 'article_categories', 'article_category_assignments',
                'contact_messages', 'contact_chat_messages', 'admin_notifications', 'emergency_contacts',
                'admin_users', 'ai_providers', 'ai_settings', 'ai_training_entries', 'site_settings',
                'analytics_sessions', 'analytics_daily_visits', 'analytics_page_views', 'cv_profiles',
                'job_sources', 'job_posts', 'job_search_preferences', 'job_board_sources',
                'job_source_import_runs', 'job_matches', 'recruiter_contacts', 'job_email_drafts',
                'job_agent_settings', 'job_agent_email_settings', 'job_agent_email_events',
                'job_agent_ai_settings', 'personal_access_tokens',
            ];
            $missing = array_values(array_filter($expected, fn ($name) => !Schema::connection('mysql')->hasTable($name)));
            $this->check($missing === [], '50 domain/auth database tables', $missing ? implode(', ', $missing) : 'all present');
        } catch (\Throwable $error) {
            $this->failures[] = 'MySQL connection/query error: '.$error->getMessage();
            $this->error('FAIL MySQL connection');
        }

        if ((bool) config('app.debug') && config('app.env') === 'production') {
            $this->failures[] = 'APP_DEBUG must be false in production.';
            $this->error('FAIL production debug mode');
        }
        if (config('job_agent.allow_sending')) {
            $this->warn('WARN outbound job-email sending is enabled; perform live transport/recipient checks.');
        }

        $this->newLine();
        $this->line('Failures: '.count($this->failures).' | Warnings: '.count($this->warnings));
        if ($this->failures) {
            foreach ($this->failures as $failure) {
                $this->error($failure);
            }
            return self::FAILURE;
        }
        $this->info('Preflight checks passed; this is NOT a full API/e2e parity certification.');
        return self::SUCCESS;
    }

    private function check(bool $pass, string $name, string $detail = ''): void
    {
        if ($pass) {
            $this->line('<info>PASS</info> '.$name.($detail ? ' — '.$detail : ''));
        } else {
            $this->line('<error>FAIL</error> '.$name.($detail ? ' — '.$detail : ''));
            $this->failures[] = $name.($detail ? ': '.$detail : '');
        }
    }
}
