<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Service extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Service';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['slug', 'name', 'impression', 'impressionCount', 'description', 'content', 'isFeatured', 'icon', 'status', 'views', 'sortOrder'];

    protected $casts = [
        'impressionCount' => 'integer',
        'isFeatured' => 'boolean',
        'status' => 'boolean',
        'views' => 'integer',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function comments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ServiceComment::class, 'serviceId');
    }

}
