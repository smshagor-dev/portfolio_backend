<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AiProvider extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ai_providers';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['name', 'baseUrl', 'isActive'];
    protected $hidden = ['apiKey'];

    protected $casts = [
        'isActive' => 'boolean',
        'createdAt' => 'datetime',
    ];
}
