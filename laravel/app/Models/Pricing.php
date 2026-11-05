<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Pricing extends Model
{
    protected $table = 'pricings';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['slug', 'name', 'description', 'price', 'duration', 'content', 'features', 'status', 'isPopular', 'sortOrder'];

    protected $casts = [
        'price' => 'float',
        'features' => 'array',
        'status' => 'boolean',
        'isPopular' => 'boolean',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
