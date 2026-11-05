<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AnalyticsSession extends Model
{
    protected $table = 'analytics_sessions';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['sessionId', 'firstPath', 'lastPath', 'ipAddress', 'country', 'region', 'city', 'userAgent', 'lastSeenAt'];

    protected $casts = [
        'createdAt' => 'datetime',
        'lastSeenAt' => 'datetime',
    ];
}
