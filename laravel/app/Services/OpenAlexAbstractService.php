<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class OpenAlexAbstractService
{
    public function reconstruct(array $index): string
    {
        $words = [];
        foreach ($index as $word => $positions) {
            if (!is_string($word) || !is_array($positions)) {
                continue;
            }
            foreach ($positions as $position) {
                if (is_int($position) && $position >= 0 && $position < 10000) {
                    $words[$position] = $word;
                }
            }
        }
        ksort($words);
        return Str::limit(implode(' ', $words), 12000, '');
    }

    public function byDoi(string $doi): string
    {
        if (!preg_match('~^10\.\d{4,9}/\S+$~iD', $doi)) {
            return '';
        }
        $params = [];
        if (config('research.openalex_api_key')) {
            $params['api_key'] = (string) config('research.openalex_api_key');
        }
        try {
            $response = Http::timeout(15)->withoutRedirecting()->acceptJson()->get(
                'https://api.openalex.org/works/doi:'.rawurlencode($doi),
                $params
            );
            if (!$response->successful()) {
                return '';
            }
            $index = $response->json('abstract_inverted_index');
            return is_array($index) ? $this->reconstruct($index) : '';
        } catch (\Throwable $exception) {
            report($exception);
            return '';
        }
    }
}
