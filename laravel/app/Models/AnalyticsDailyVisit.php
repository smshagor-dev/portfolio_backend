<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AnalyticsDailyVisit extends Model
{
    protected $table = 'analytics_daily_visits';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['sessionRef', 'visitDate', 'path'];

    protected $casts = [
        'sessionRef' => 'integer',
        'visitDate' => 'datetime',
        'createdAt' => 'datetime',
    ];
}
