<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class CvProfile extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'cv_profiles';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'extraNotes', 'targetRoles', 'preferredCountries', 'resumeUrl', 'resumeFileName', 'resumeUpdatedAt', 'isDefault'];

    protected $casts = [


        'resumeUpdatedAt' => 'datetime',
        'isDefault' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
