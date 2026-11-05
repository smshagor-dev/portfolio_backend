<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AiProvider extends Model
{
    use \App\Models\Concerns\MapsPrismaFields;

    protected const PRISMA_FIELD_MAP = [
        'apiKey' => 'api_key',
        'baseUrl' => 'base_url',
        'isActive' => 'is_active',
        'createdAt' => 'created_at',
    ];
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ai_providers';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['name', 'baseUrl', 'isActive'];
    protected $hidden = ['apiKey', 'api_key'];

    protected $casts = [
        'isActive' => 'boolean',
        'createdAt' => 'datetime',
    ];
}
