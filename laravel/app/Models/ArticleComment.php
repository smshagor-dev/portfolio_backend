<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ArticleComment extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ArticleComment';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['articleId', 'name', 'comment', 'sortOrder'];

    protected $casts = [
        'articleId' => 'integer',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function replies(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ArticleReply::class, 'commentId');
    }

}
