<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    protected $table = 'services';
    protected $primaryKey = 'id';
    public $incrementing = true;
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
}
