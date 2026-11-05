<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ResearchComment extends Model
{
    protected $table = 'research_comments';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['publicationId', 'name', 'comment', 'sortOrder'];

    protected $casts = [
        'publicationId' => 'integer',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
