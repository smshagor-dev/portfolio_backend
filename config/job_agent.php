<?php

return [
    'allow_attachments' => (bool) env('JOB_AGENT_ATTACHMENTS_ENABLED', false),
    'tracking_enabled' => (bool) env('JOB_AGENT_TRACKING_ENABLED', false),
    'source_sync_enabled' => (bool) env('JOB_SOURCE_SYNC_ENABLED', false),
    'allow_sending' => (bool) env('JOB_AGENT_SEND_ENABLED', false),
];
