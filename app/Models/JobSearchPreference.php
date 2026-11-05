<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobSearchPreference extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_search_preferences';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['rolesJson', 'customKeywordsJson', 'jobTypesJson', 'workModesJson', 'regionsJson', 'experienceLevelsJson', 'preferredLanguagesJson', 'maxJobsPerSync', 'minimumMatchScoreToDraft', 'autoDraftEnabled'];

    protected $casts = [







        'maxJobsPerSync' => 'integer',
        'minimumMatchScoreToDraft' => 'integer',
        'autoDraftEnabled' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
