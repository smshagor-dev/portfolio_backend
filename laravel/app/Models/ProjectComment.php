<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ProjectComment extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ProjectComment';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['projectId', 'name', 'comment', 'sortOrder'];

    protected $casts = [
        'projectId' => 'integer',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function replies(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ProjectReply::class, 'commentId');
    }

}
