<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    protected $table = 'projects';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['slug', 'name', 'description', 'content', 'tools', 'role', 'code', 'demo', 'image', 'views', 'impressionCount', 'buttons', 'sortOrder'];

    protected $casts = [
        'tools' => 'array',
        'views' => 'integer',
        'impressionCount' => 'integer',
        'buttons' => 'array',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function comments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ProjectComment::class, 'projectId');
    }

}
