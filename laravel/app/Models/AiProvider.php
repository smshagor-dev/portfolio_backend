<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiProvider extends Model
{
    protected $table = 'ai_providers';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['name', 'baseUrl', 'isActive'];
    protected $hidden = ['apiKey'];

    protected $casts = [
        'isActive' => 'boolean',
        'createdAt' => 'datetime',
    ];
}
