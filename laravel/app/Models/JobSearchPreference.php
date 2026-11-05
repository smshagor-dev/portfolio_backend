<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobSearchPreference extends Model
{
    protected $table = 'job_search_preferences';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['rolesJson', 'customKeywordsJson', 'jobTypesJson', 'workModesJson', 'regionsJson', 'experienceLevelsJson', 'preferredLanguagesJson', 'maxJobsPerSync', 'minimumMatchScoreToDraft', 'autoDraftEnabled'];

    protected $casts = [
        'rolesJson' => 'array',
        'customKeywordsJson' => 'array',
        'jobTypesJson' => 'array',
        'workModesJson' => 'array',
        'regionsJson' => 'array',
        'experienceLevelsJson' => 'array',
        'preferredLanguagesJson' => 'array',
        'maxJobsPerSync' => 'integer',
        'minimumMatchScoreToDraft' => 'integer',
        'autoDraftEnabled' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
