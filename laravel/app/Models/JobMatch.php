<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobMatch extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_matches';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['jobPostId', 'cvProfileId', 'score', 'matchedSkills', 'missingSkills', 'summary', 'aiAnalysis', 'coverLetter'];

    protected $casts = [
        'jobPostId' => 'integer',
        'cvProfileId' => 'integer',
        'score' => 'integer',



        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
