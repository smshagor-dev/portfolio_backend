<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectReply extends Model
{
    protected $table = 'project_replies';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['commentId', 'name', 'reply', 'sortOrder'];

    protected $casts = [
        'commentId' => 'integer',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
