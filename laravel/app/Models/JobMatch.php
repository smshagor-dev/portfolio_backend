<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobMatch extends Model
{
    protected $table = 'job_matchs';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['jobPostId', 'cvProfileId', 'score', 'matchedSkills', 'missingSkills', 'summary', 'aiAnalysis', 'coverLetter'];

    protected $casts = [
        'jobPostId' => 'integer',
        'cvProfileId' => 'integer',
        'score' => 'integer',
        'matchedSkills' => 'array',
        'missingSkills' => 'array',
        'aiAnalysis' => 'array',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
