<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Article extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'Article';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'slug', 'shortDescription', 'content', 'category', 'tags', 'featuredImage', 'metaTitle', 'metaDescription', 'author', 'status', 'publishDate', 'commentsEnabled', 'isFeatured', 'views', 'impressionCount', 'shareCount'];

    protected $casts = [

        'publishDate' => 'datetime',
        'commentsEnabled' => 'boolean',
        'isFeatured' => 'boolean',
        'views' => 'integer',
        'impressionCount' => 'integer',
        'shareCount' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function comments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ArticleComment::class, 'articleId');
    }

}
