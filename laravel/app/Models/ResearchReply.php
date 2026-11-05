<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ResearchReply extends Model
{
    use \App\Models\Concerns\MapsPrismaFields;

    protected const PRISMA_FIELD_MAP = [
        'commentId' => 'comment_id',
        'sortOrder' => 'sort_order',
        'createdAt' => 'created_at',
        'updatedAt' => 'updated_at',
    ];
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'researchreply';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
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
