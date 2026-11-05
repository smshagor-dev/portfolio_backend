<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ServiceComment extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ServiceComment';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['serviceId', 'photo', 'comment', 'impression', 'sortOrder'];

    protected $casts = [
        'serviceId' => 'integer',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function replies(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ServiceReply::class, 'commentId');
    }

}
