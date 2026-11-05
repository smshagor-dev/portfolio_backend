<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ResearchComment extends Model
{
    use \App\Models\Concerns\MapsPrismaFields;

    protected const PRISMA_FIELD_MAP = [
        'publicationId' => 'publication_id',
        'sortOrder' => 'sort_order',
        'createdAt' => 'created_at',
        'updatedAt' => 'updated_at',
    ];
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'researchcomment';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
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
    public function replies(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ResearchReply::class, 'comment_id');
    }

}
