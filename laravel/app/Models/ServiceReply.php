<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ServiceReply extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ServiceReply';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['commentId', 'reply', 'impression', 'sortOrder'];

    protected $casts = [
        'commentId' => 'integer',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
