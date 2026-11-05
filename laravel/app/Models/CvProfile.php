<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CvProfile extends Model
{
    protected $table = 'cv_profiles';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'extraNotes', 'targetRoles', 'preferredCountries', 'resumeUrl', 'resumeFileName', 'resumeUpdatedAt', 'isDefault'];

    protected $casts = [
        'targetRoles' => 'array',
        'preferredCountries' => 'array',
        'resumeUpdatedAt' => 'datetime',
        'isDefault' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
