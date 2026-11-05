<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class ImportPortfolioJson extends Command
{
    protected $signature = 'portfolio:import {file : Filename within storage/app/imports} {--commit : Write to MySQL; otherwise dry run}';
    protected $description = 'Safely inspect or import exported Prisma model records into new MySQL tables';

    private const SKIPPED_SENSITIVE = [
        'AdminUser', 'AiProvider', 'AiSettings', 'SiteSettings',
        'JobAgentSettings', 'JobAgentEmailSetting', 'JobAgentAiSetting',
    ];

    public function handle(): int
    {
        $base = storage_path('app/imports');
        $filename = basename((string) $this->argument('file'));
        if ($filename !== (string) $this->argument('file') || !str_ends_with(strtolower($filename), '.json')) {
            $this->error('Specify only a .json file inside storage/app/imports.');
            return self::FAILURE;
        }
        $path = $base.DIRECTORY_SEPARATOR.$filename;
        if (!is_file($path) || is_link($path) || filesize($path) > 100 * 1024 * 1024) {
            $this->error('Import file must be a regular JSON file no larger than 100 MiB.');
            return self::FAILURE;
        }

        try {
            $document = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($document) || array_is_list($document)) {
                throw new \InvalidArgumentException('Expected an object mapping Prisma model names to arrays of records.');
            }
            $plan = [];
            $count = 0;
            foreach ($document as $modelName => $records) {
                if (!preg_match('/^[A-Z][A-Za-z0-9]+$/D', (string) $modelName) || in_array($modelName, self::SKIPPED_SENSITIVE, true)) {
                    throw new \InvalidArgumentException('Sensitive or unknown model in import: '.$modelName);
                }
                $class = 'App\\Models\\'.$modelName;
                if (!class_exists($class) || !is_subclass_of($class, Model::class) || !is_array($records) || !array_is_list($records)) {
                    throw new \InvalidArgumentException('Invalid model or record list: '.$modelName);
                }
                foreach ($records as $record) {
                    if (!is_array($record) || array_is_list($record)) {
                        throw new \InvalidArgumentException('Every record must be a JSON object.');
                    }
                    if (isset($record['id']) && !is_int($record['id']) && !is_string($record['id'])) {
                        throw new \InvalidArgumentException('Invalid record ID in '.$modelName);
                    }
                }
                $plan[$modelName] = $records;
                $count += count($records);
            }
            $this->info('Validated '.$count.' records in '.count($plan).' model collections.');
            if (!$this->option('commit')) {
                $this->warn('DRY RUN only. Use --commit to insert missing IDs into the target MySQL database.');
                return self::SUCCESS;
            }
            if (!$this->confirm('Insert these records into the configured database? Existing IDs will be skipped.', false)) {
                $this->warn('Cancelled.');
                return self::SUCCESS;
            }
            // Ordering follows the source Prisma schema declaration, parents before children.
            $order = [
                'Profile','Skill','Experience','Education','StatsCounter','Achievement','ServiceSection',
                'Service','ServiceComment','ServiceReply','Project','ProjectComment','ProjectReply',
                'Pricing','Faq','Testimonial','Article','ResearchPublication','ResearchComment','ResearchReply',
                'ArticleComment','ArticleReply','ArticleCategory','ArticleCategoryAssignment',
                'ContactMessage','ContactChatMessage','AdminNotification','EmergencyContact','AnalyticsSession',
                'AnalyticsDailyVisit','AnalyticsPageView','CvProfile','JobSource','JobPost','JobSearchPreference',
                'JobBoardSource','JobSourceImportRun','JobMatch','RecruiterContact','JobEmailDraft','JobAgentEmailEvent',
            ];
            $inserted = 0;
            DB::transaction(function () use ($order, $plan, &$inserted): void {
                foreach ($order as $name) {
                    if (!isset($plan[$name])) {
                        continue;
                    }
                    $class = 'App\\Models\\'.$name;
                    foreach ($plan[$name] as $record) {
                        if (isset($record['id']) && $class::find($record['id'])) {
                            continue;
                        }
                        $model = new $class();
                        $model->forceFill($record);
                        $model->save();
                        $inserted++;
                    }
                }
            }, 3);
            $this->info('Inserted '.$inserted.' records. Check IDs and API parity before any cutover.');
            return self::SUCCESS;
        } catch (\Throwable $error) {
            $this->error($error->getMessage());
            return self::FAILURE;
        }
    }
}
