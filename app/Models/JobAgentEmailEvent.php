<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobAgentEmailEvent extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_agent_email_events';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['draftId', 'jobPostId', 'recipientEmail', 'eventType', 'trackingId', 'url', 'userAgent', 'ipHash'];

    protected $casts = [
        'draftId' => 'integer',
        'jobPostId' => 'integer',
        'createdAt' => 'datetime',
    ];
}
