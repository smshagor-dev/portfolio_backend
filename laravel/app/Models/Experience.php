<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Experience extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Experience';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'company', 'location', 'duration', 'description', 'sortOrder'];

    protected $casts = [
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
