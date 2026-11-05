<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobAgentSettings extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_agent_settings';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
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

        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
