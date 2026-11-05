<?php

namespace App\Services;

use App\Models\ResearchPublication;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ResearchSyncService
{
    public const OVERRIDE_MARKER = '<!-- portfolio:research-manual-override -->';

    public function status(): array
    {
        return [
            'enabled' => (bool) config('research.enabled'),
            'orcidId' => (string) config('research.orcid_id'),
            'running' => (bool) Cache::get('research:running', false),
            'lastResult' => Cache::get('research:last_result'),
            'lastSuccessAt' => Cache::get('research:last_success'),
            'lastError' => Cache::get('research:last_error', ''),
            'intervalHours' => (int) config('research.interval_hours'),
        ];
    }

    public function sync(): array
    {
        $orcid = (string) config('research.orcid_id');
        if (!config('research.enabled') || !preg_match('/^\d{4}-\d{4}-\d{4}-[\dX]{4}$/D', $orcid)) {
            throw new \RuntimeException('Research sync disabled or RESEARCH_ORCID_ID is invalid.');
        }

        $lock = Cache::lock('research:sync:lock', 600);
        if (!$lock->get()) {
            return ['running' => true, 'message' => 'Research sync is already running.'];
        }
        Cache::put('research:running', true, 600);
        $summary = ['checked' => 0, 'created' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0];
        try {
            $groups = Http::timeout(20)->acceptJson()->get(
                'https://pub.orcid.org/v3.0/'.$orcid.'/works'
            )->throw()->json('group', []);

            foreach ($groups as $group) {
                $work = $group['work-summary'][0] ?? null;
                if (!$work || empty($work['title']['title']['value'])) {
                    $summary['skipped']++;
                    continue;
                }
                $summary['checked']++;
                try {
                    $this->syncOne($work, $summary);
                } catch (\Throwable $exception) {
                    report($exception);
                    $summary['failed']++;
                }
            }
            Cache::put('research:last_result', $summary, now()->addDays(14));
            Cache::put('research:last_success', now()->toIso8601String(), now()->addDays(14));
            Cache::forget('research:last_error');
            return $summary;
        } catch (\Throwable $exception) {
            Cache::put('research:last_error', $exception->getMessage(), now()->addDays(14));
            throw $exception;
        } finally {
            Cache::forget('research:running');
            $lock->release();
        }
    }

    private function syncOne(array $work, array &$stats): void
    {
        $title = trim((string) ($work['title']['title']['value'] ?? ''));
        $externalIds = $work['external-ids']['external-id'] ?? [];
        $doi = '';
        foreach ($externalIds as $item) {
            if (strtolower((string) ($item['external-id-type'] ?? '')) === 'doi') {
                $doi = strtolower(trim((string) ($item['external-id-value'] ?? '')));
                $doi = (string) preg_replace('~^https?://(?:dx\.)?doi\.org/~', '', $doi);
                break;
            }
        }
        $publisher = trim((string) ($work['journal-title'] ?? ''));
        $year = (int) ($work['publication-date']['year']['value'] ?? date('Y'));
        $month = (int) ($work['publication-date']['month']['value'] ?? 1);
        $day = (int) ($work['publication-date']['day']['value'] ?? 1);
        $year = max(1900, min(2100, $year));
        $month = max(1, min(12, $month));
        $day = max(1, min(28, $day));
        $date = Carbon::create($year, $month, $day, 0, 0, 0, 'UTC');
        $publicationUrl = (string) ($work['url']['value'] ?? ($doi ? 'https://doi.org/'.$doi : 'https://orcid.org/'.config('research.orcid_id')));
        $abstract = '';
        $authors = [];

        if ($doi) {
            try {
                $crossref = Http::timeout(15)->acceptJson()->get('https://api.crossref.org/works/'.rawurlencode($doi))->throw()->json('message', []);
                $abstract = trim(strip_tags((string) ($crossref['abstract'] ?? '')));
                $publisher = trim((string) ($crossref['publisher'] ?? $publisher));
                $authors = array_values(array_filter(array_map(
                    fn ($author) => trim(($author['given'] ?? '').' '.($author['family'] ?? '')),
                    $crossref['author'] ?? []
                )));
                if (!empty($crossref['type'])) {
                    $work['publicationType'] = (string) $crossref['type'];
                }
            } catch (\Throwable $exception) {
                // ORCID works may lack Crossref metadata. Keep the ORCID record.
                report($exception);
            }
        }

        if (!$abstract && $doi) {
            $abstract = app(OpenAlexAbstractService::class)->byDoi($doi);
        }
        $slug = Str::slug($title);
        if (!$slug) {
            $stats['skipped']++;
            return;
        }
        $existing = $doi ? ResearchPublication::where('doi', $doi)->first() : null;
        $existing ??= ResearchPublication::where('slug', $slug)->first();
        if ($existing && str_contains((string) $existing->content, self::OVERRIDE_MARKER)) {
            $stats['skipped']++;
            return;
        }
        if (!$existing && ResearchPublication::where('slug', $slug)->exists()) {
            $slug .= '-'.substr(sha1($doi ?: $title), 0, 8);
        }
        $data = [
            'title' => $title, 'slug' => $existing?->slug ?? $slug,
            'shortSummary' => Str::limit($abstract ?: $title, 480),
            'content' => $abstract,
            'publicationType' => (string) ($work['publicationType'] ?? $work['publication-type'] ?? 'research-publication'),
            'researchArea' => 'Research',
            'publisherName' => $publisher,
            'publishedDate' => $date,
            'doi' => $doi ?: null,
            'publicationUrl' => $publicationUrl,
            'citationUrl' => $doi ? 'https://doi.org/'.$doi : null,
            'authors' => $authors,
            'myAuthorRole' => null,
            'thumbnailImage' => '/api/research-publications/default-thumbnail.svg',
            'status' => 'published',
        ];

        if ($existing) {
            $existing->fill($data)->save();
            $stats['updated']++;
        } else {
            ResearchPublication::create($data);
            $stats['created']++;
        }
    }
}
