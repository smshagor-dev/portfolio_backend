<?php

namespace App\Console\Commands;

use App\Services\ResearchSyncService;
use Illuminate\Console\Command;

class SyncResearchPublications extends Command
{
    protected $signature = 'portfolio:sync-research';
    protected $description = 'Synchronize ORCID and available Crossref metadata with MySQL';

    public function handle(ResearchSyncService $service): int
    {
        try {
            $this->line(json_encode($service->sync(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return self::SUCCESS;
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());
            return self::FAILURE;
        }
    }
}
