<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AiTrainingEntry extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ai_training_entries';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['question', 'answer', 'isActive'];

    protected $casts = [
        'isActive' => 'boolean',
        'createdAt' => 'datetime',
    ];
}
