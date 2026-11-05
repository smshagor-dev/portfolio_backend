<?php

namespace App\Console\Commands;

use App\Models\JobBoardSource;
use App\Services\JobSourceService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class SyncJobSources extends Command
{
    protected $signature = 'portfolio:sync-job-sources {--limit=10 : Maximum active sources to check}';
    protected $description = 'Import vacancies only from enabled, approved provider APIs';

    public function handle(JobSourceService $service): int
    {
        if (!config('job_agent.source_sync_enabled')) {
            $this->warn('Source sync is disabled by environment configuration.');
            return self::SUCCESS;
        }
        $lock = Cache::lock('job-agent:source-sync', 600);
        if (!$lock->get()) {
            $this->warn('Another job source sync is running.');
            return self::SUCCESS;
        }

        $failures = 0;
        $imported = 0;
        try {
            $limit = max(1, min(25, (int) $this->option('limit')));
            foreach (JobBoardSource::where('enabled', true)->orderBy('id')->limit($limit)->get() as $source) {
                try {
                    $result = $service->sync($source);
                    $imported += (int) ($result['importedCount'] ?? 0);
                    $this->info($source->sourceName.': '.($result['importedCount'] ?? 0).' imported');
                } catch (\Throwable $error) {
                    $failures++;
                    report($error);
                    $this->error($source->sourceName.': failed; inspect logs');
                }
            }
            $this->line('Imported '.$imported.' jobs. Failed sources: '.$failures);
            return $failures ? self::FAILURE : self::SUCCESS;
        } finally {
            $lock->release();
        }
    }
}
