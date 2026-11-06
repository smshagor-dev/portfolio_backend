<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Education extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Education';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'duration', 'institution', 'department', 'achievement', 'sortOrder'];

    protected $casts = [
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
