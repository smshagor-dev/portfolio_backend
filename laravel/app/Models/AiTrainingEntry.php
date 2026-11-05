<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiTrainingEntry extends Model
{
    protected $table = 'ai_training_entries';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['question', 'answer', 'isActive'];

    protected $casts = [
        'isActive' => 'boolean',
        'createdAt' => 'datetime',
    ];
}
