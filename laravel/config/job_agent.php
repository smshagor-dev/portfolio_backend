<?php

return [
    'tracking_enabled' => (bool) env('JOB_AGENT_TRACKING_ENABLED', false),
    'allow_sending' => (bool) env('JOB_AGENT_SEND_ENABLED', false),
];
