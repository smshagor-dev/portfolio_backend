<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Article extends Model
{
    protected $table = 'articles';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'slug', 'shortDescription', 'content', 'category', 'tags', 'featuredImage', 'metaTitle', 'metaDescription', 'author', 'status', 'publishDate', 'commentsEnabled', 'isFeatured', 'views', 'impressionCount', 'shareCount'];

    protected $casts = [
        'tags' => 'array',
        'publishDate' => 'datetime',
        'commentsEnabled' => 'boolean',
        'isFeatured' => 'boolean',
        'views' => 'integer',
        'impressionCount' => 'integer',
        'shareCount' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
