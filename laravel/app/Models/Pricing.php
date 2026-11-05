<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Pricing extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Pricing';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['slug', 'name', 'description', 'price', 'duration', 'content', 'features', 'status', 'isPopular', 'sortOrder'];

    protected $casts = [
        'price' => 'float',

        'status' => 'boolean',
        'isPopular' => 'boolean',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
