<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class StatsCounter extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'StatsCounter';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
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
