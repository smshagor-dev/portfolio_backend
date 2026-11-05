<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceComment extends Model
{
    protected $table = 'service_comments';
    protected $primaryKey = 'id';
    public $incrementing = true;
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
