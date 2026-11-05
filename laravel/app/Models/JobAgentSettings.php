<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobAgentSettings extends Model
{
    protected $table = 'job_agent_settingses';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['gmailConnectedEmail', 'gmailHistoryId', 'gmailQuery', 'dailySendLimit', 'sendsToday', 'sendLimitDate', 'autoSendEnabled', 'defaultCvProfileId', 'approvedApiSources'];
    protected $hidden = ['gmailRefreshToken'];

    protected $casts = [
        'dailySendLimit' => 'integer',
        'sendsToday' => 'integer',
        'sendLimitDate' => 'datetime',
        'autoSendEnabled' => 'boolean',
        'defaultCvProfileId' => 'integer',
        'approvedApiSources' => 'array',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
