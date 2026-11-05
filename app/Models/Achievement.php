<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Achievement extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Achievement';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'issuer', 'date', 'type', 'image', 'sortOrder'];

    protected $casts = [
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
