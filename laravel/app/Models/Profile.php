<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Profile extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Profile';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'profile', 'designation', 'description', 'email', 'phone', 'address', 'github', 'facebook', 'linkedIn', 'twitter', 'stackOverflow', 'leetcode', 'socialLinks', 'devUsername', 'resume', 'heroSkills', 'hardWorker', 'quickLearner', 'problemSolver'];

    protected $casts = [


        'hardWorker' => 'boolean',
        'quickLearner' => 'boolean',
        'problemSolver' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
