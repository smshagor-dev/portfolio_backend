<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ArticleCategoryAssignment extends Model
{
    protected $table = 'ArticleCategoryAssignment';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
    protected $fillable = ['articleId', 'categoryId'];

    protected $casts = [
        'articleId' => 'integer',
        'categoryId' => 'integer',
    ];

}
