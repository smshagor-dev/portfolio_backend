<?php

return [
    'enabled' => env('RESEARCH_SYNC_ENABLED', false),
    'orcid_id' => env('RESEARCH_ORCID_ID', ''),
    'interval_hours' => (int) env('RESEARCH_SYNC_INTERVAL_HOURS', 12),
];
