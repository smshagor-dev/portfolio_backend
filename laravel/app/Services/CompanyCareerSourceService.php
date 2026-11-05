<?php

namespace App\Services;

final class CompanyCareerSourceService
{
    /**
     * Recognize public ATS careers pages. Return a fixed, provider-owned API
     * URL rather than fetching an arbitrary user-supplied website.
     */
    public static function recognize(string $careersUrl): ?array
    {
        $parts = parse_url(trim($careersUrl));
        if (!is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || isset($parts['user'], $parts['pass'])
            || isset($parts['port'])
            || empty($parts['host'])) {
            return null;
        }
        $host = strtolower((string) $parts['host']);
        $path = trim((string) ($parts['path'] ?? ''), '/');
        $segment = explode('/', $path)[0] ?? '';
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/D', $segment)) {
            return null;
        }

        return match ($host) {
            'jobs.lever.co' => [
                'provider' => 'LEVER',
                'apiUrl' => 'https://api.lever.co/v0/postings/'.$segment.'?mode=json',
            ],
            'boards.greenhouse.io', 'job-boards.greenhouse.io' => [
                'provider' => 'GREENHOUSE',
                'apiUrl' => 'https://boards-api.greenhouse.io/v1/boards/'.$segment.'/jobs?content=true',
            ],
            default => null,
        };
    }
}
