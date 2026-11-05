<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ArticleCategoryAssignment extends Model
{
    protected $table = 'article_category_assignments';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
    protected $fillable = ['articleId', 'categoryId'];

    protected $casts = [
        'articleId' => 'integer',
        'categoryId' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function ($model): void {
            if (!$model->id) {
                $model->id = (string) \Illuminate\Support\Str::uuid();
            }
        });
    }
}
