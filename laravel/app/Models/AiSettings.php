<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiSettings extends Model
{
    protected $table = 'ai_settings';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['activeProvider', 'modelName'];

    protected $casts = [
        'createdAt' => 'datetime',
    ];
}
