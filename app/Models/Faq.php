<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Faq extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Faq';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
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
