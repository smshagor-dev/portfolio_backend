<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AnalyticsPageView extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'AnalyticsPageView';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['sessionRef', 'path', 'firstViewedAt', 'lastViewedAt', 'viewCount'];

    protected $casts = [
        'sessionRef' => 'integer',
        'firstViewedAt' => 'datetime',
        'lastViewedAt' => 'datetime',
        'viewCount' => 'integer',
    ];
}
