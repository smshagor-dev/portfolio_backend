<?php

namespace App\Models;

use Illuminate\Support\Str;
use MongoDB\Laravel\Eloquent\Model;

class LinkedInPost extends Model
{
    protected $table = 'linkedin_posts';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'embedUrl', 'postUrl', 'status', 'sortOrder'];
    protected $casts = [
        'status' => 'boolean',
        'sortOrder' => 'integer',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            if (!$model->getKey()) {
                $model->setAttribute('id', 'linkedin-'.(string) Str::uuid());
            }
        });
    }
}
