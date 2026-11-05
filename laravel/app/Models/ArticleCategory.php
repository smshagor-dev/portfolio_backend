<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ArticleCategory extends Model
{
    protected $table = 'article_categories';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'slug'];

    protected $casts = [
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
