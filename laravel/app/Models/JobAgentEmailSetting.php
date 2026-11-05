<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobAgentEmailSetting extends Model
{
    protected $table = 'job_agent_email_settings';
    protected $primaryKey = 'id';
    public $incrementing = true;
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
