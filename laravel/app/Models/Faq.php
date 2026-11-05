<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Faq extends Model
{
    protected $table = 'faqs';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['question', 'answer', 'status', 'sortOrder'];

    protected $casts = [
        'status' => 'boolean',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
