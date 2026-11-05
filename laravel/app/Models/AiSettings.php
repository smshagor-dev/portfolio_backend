<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AiSettings extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ai_settings';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['activeProvider', 'modelName'];

    protected $casts = [
        'createdAt' => 'datetime',
    ];
}
