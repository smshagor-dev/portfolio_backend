<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Profile extends Model
{
    protected $table = 'profiles';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'profile', 'designation', 'description', 'email', 'phone', 'address', 'github', 'facebook', 'linkedIn', 'twitter', 'stackOverflow', 'leetcode', 'socialLinks', 'devUsername', 'resume', 'heroSkills', 'hardWorker', 'quickLearner', 'problemSolver'];

    protected $casts = [
        'socialLinks' => 'array',
        'heroSkills' => 'array',
        'hardWorker' => 'boolean',
        'quickLearner' => 'boolean',
        'problemSolver' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
