<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobAgentEmailEvent extends Model
{
    protected $table = 'job_agent_email_events';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['draftId', 'jobPostId', 'recipientEmail', 'eventType', 'trackingId', 'url', 'userAgent', 'ipHash'];

    protected $casts = [
        'draftId' => 'integer',
        'jobPostId' => 'integer',
        'createdAt' => 'datetime',
    ];
}
