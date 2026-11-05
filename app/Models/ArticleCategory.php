<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ArticleCategory extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ArticleCategory';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'slug'];

    protected $casts = [
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
