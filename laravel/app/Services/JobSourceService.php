<?php

namespace App\Services;

use App\Models\JobBoardSource;
use App\Models\JobPost;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class JobSourceService
{
    private const HOSTS = [
        'www.arbeitnow.com', 'remoteok.com', 'remotive.com',
        'api.lever.co', 'boards-api.greenhouse.io',
    ];

    public function sync(JobBoardSource $source): array
    {
        if (!$source->enabled) {
            throw new \InvalidArgumentException('Job source must be enabled before synchronization.');
        }
        $url = trim((string) $source->baseUrl);
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if (parse_url($url, PHP_URL_SCHEME) !== 'https' || !in_array($host, self::HOSTS, true)) {
            throw new \InvalidArgumentException('Only approved HTTPS job provider APIs are supported.');
        }
        $response = Http::timeout(15)->withHeaders(['User-Agent' => 'PortfolioJobAgent/1.0'])->get($url);
        $response->throw();
        if (strlen($response->body()) > 4 * 1024 * 1024) {
            throw new \RuntimeException('Job API response too large.');
        }
        $payload = $response->json();
        $raw = match ($host) {
            'www.arbeitnow.com' => data_get($payload, 'data', []),
            'remoteok.com' => $payload,
            'remotive.com' => data_get($payload, 'jobs', []),
            'api.lever.co' => $payload,
            'boards-api.greenhouse.io' => data_get($payload, 'jobs', []),
        };
        if (!is_array($raw)) {
            throw new \RuntimeException('Invalid job provider API result.');
        }
        $imported = 0;
        $duplicates = 0;
        foreach (array_slice($raw, 0, 40) as $job) {
            if (!is_array($job)) {
                continue;
            }
            [$title, $company, $location, $jobUrl, $description] = match ($host) {
                'www.arbeitnow.com' => [
                    $job['title'] ?? '', $job['company_name'] ?? '', $job['location'] ?? '',
                    $job['url'] ?? '', $job['description'] ?? '',
                ],
                'remoteok.com' => [
                    $job['position'] ?? '', $job['company'] ?? '', $job['location'] ?? 'Remote',
                    $job['url'] ?? '', $job['description'] ?? '',
                ],
                'remotive.com' => [
                    $job['title'] ?? '', $job['company_name'] ?? '', $job['candidate_required_location'] ?? '',
                    $job['url'] ?? '', $job['description'] ?? '',
                ],
                'api.lever.co' => [
                    $job['text'] ?? '', $source->companyName ?: $source->sourceName,
                    data_get($job, 'categories.location', ''), $job['hostedUrl'] ?? $job['applyUrl'] ?? '',
                    $job['descriptionPlain'] ?? $job['description'] ?? '',
                ],
                'boards-api.greenhouse.io' => [
                    $job['title'] ?? '', $source->companyName ?: $source->sourceName,
                    data_get($job, 'location.name', ''), $job['absolute_url'] ?? '',
                    $job['content'] ?? '',
                ],
            };
            if (!is_string($jobUrl) || !preg_match('~^https://~i', $jobUrl)
                || !is_string($title) || !$title) {
                continue;
            }
            if (JobPost::where('sourceUrl', $jobUrl)->exists()) {
                $duplicates++;
                continue;
            }
            $description = Str::limit(strip_tags((string) $description), 100000, '');
            JobPost::create([
                'title' => Str::limit(strip_tags($title), 190, ''),
                'company' => Str::limit(strip_tags((string) $company), 190, ''),
                'location' => Str::limit(strip_tags((string) $location), 190, ''),
                'sourceUrl' => Str::limit($jobUrl, 255, ''),
                'applyUrl' => Str::limit($jobUrl, 255, ''),
                'companyUrl' => '',
                'sourceType' => $source->sourceType,
                'sourceName' => $source->sourceName,
                'importMethod' => 'API',
                'descriptionStatus' => $description ? 'READY' : 'DESCRIPTION_REQUIRED',
                'description' => $description,
                'rawContent' => $description,
                'status' => 'new',
            ]);
            $imported++;
        }
        $result = ['importedCount' => $imported, 'duplicateCount' => $duplicates];
        $source->forceFill([
            'lastSyncAt' => now(), 'lastImportStatsJson' => $result,
            'extractionStatus' => 'READY', 'extractionMessage' => "Imported {$imported} jobs.",
        ])->save();
        return $result;
    }
}
