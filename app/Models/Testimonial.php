<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Testimonial extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Testimonial';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'content', 'image', 'company', 'position', 'stars', 'status', 'sortOrder'];

    protected $casts = [
        'stars' => 'integer',
        'status' => 'boolean',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
