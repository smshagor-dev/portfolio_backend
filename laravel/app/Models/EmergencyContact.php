<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class EmergencyContact extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'emergencycontact';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['label', 'name', 'icon', 'link', 'sortOrder'];

    protected $casts = [
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
