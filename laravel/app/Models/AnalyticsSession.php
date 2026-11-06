<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AnalyticsSession extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'AnalyticsSession';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['sessionId', 'firstPath', 'lastPath', 'ipAddress', 'country', 'region', 'city', 'userAgent', 'lastSeenAt'];

    protected $casts = [
        'createdAt' => 'datetime',
        'lastSeenAt' => 'datetime',
    ];
}
