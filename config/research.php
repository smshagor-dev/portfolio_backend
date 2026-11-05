<?php

return [
    'enabled' => env('RESEARCH_SYNC_ENABLED', false),
    'author_name' => env('RESEARCH_AUTHOR_NAME', ''),
    'orcid_id' => env('RESEARCH_ORCID_ID', ''),
    'openalex_api_key' => env('OPENALEX_API_KEY', ''),
    'interval_hours' => (int) env('RESEARCH_SYNC_INTERVAL_HOURS', 12),
];
