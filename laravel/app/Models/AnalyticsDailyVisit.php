<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AnalyticsDailyVisit extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'AnalyticsDailyVisit';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['sessionRef', 'visitDate', 'path'];

    protected $casts = [
        'sessionRef' => 'integer',
        'visitDate' => 'datetime',
        'createdAt' => 'datetime',
    ];
}
