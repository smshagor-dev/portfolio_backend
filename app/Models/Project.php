<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Project extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Project';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['slug', 'name', 'description', 'content', 'tools', 'role', 'code', 'demo', 'image', 'views', 'impressionCount', 'buttons', 'sortOrder'];

    protected $casts = [

        'views' => 'integer',
        'impressionCount' => 'integer',

        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function comments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ProjectComment::class, 'projectId');
    }

}
