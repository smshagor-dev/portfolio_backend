<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ResearchPublication extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'research_publications';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'slug', 'shortSummary', 'content', 'publicationType', 'researchArea', 'publisherName', 'publishedDate', 'doi', 'publicationUrl', 'citationUrl', 'authors', 'myAuthorRole', 'thumbnailImage', 'views', 'impressionCount', 'shareCount', 'isFeatured', 'status'];

    protected $casts = [
        'publishedDate' => 'datetime',

        'views' => 'integer',
        'impressionCount' => 'integer',
        'shareCount' => 'integer',
        'isFeatured' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
    public function comments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ResearchComment::class, 'publicationId');
    }

}
