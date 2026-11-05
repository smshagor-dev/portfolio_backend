<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StatsCounter extends Model
{
    protected $table = 'stats_counters';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['label', 'highlight', 'count', 'icon', 'sortOrder'];

    protected $casts = [
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
