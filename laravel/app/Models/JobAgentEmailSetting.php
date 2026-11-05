<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobAgentEmailSetting extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_agent_email_settings';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['adminId', 'fromName', 'fromEmail', 'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUsername', 'dailySendLimit', 'isEnabled', 'openTrackingEnabled', 'clickTrackingEnabled'];
    protected $hidden = ['smtpPasswordEncrypted'];

    protected $casts = [
        'adminId' => 'integer',
        'smtpPort' => 'integer',
        'smtpSecure' => 'boolean',
        'dailySendLimit' => 'integer',
        'isEnabled' => 'boolean',
        'openTrackingEnabled' => 'boolean',
        'clickTrackingEnabled' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
