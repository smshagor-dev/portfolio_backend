<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AnalyticsPageView extends Model
{
    protected $table = 'analytics_page_views';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['sessionRef', 'path', 'firstViewedAt', 'lastViewedAt', 'viewCount'];

    protected $casts = [
        'sessionRef' => 'integer',
        'firstViewedAt' => 'datetime',
        'lastViewedAt' => 'datetime',
        'viewCount' => 'integer',
    ];
}
