<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ResearchPublication extends Model
{
    protected $table = 'research_publications';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['title', 'slug', 'shortSummary', 'content', 'publicationType', 'researchArea', 'publisherName', 'publishedDate', 'doi', 'publicationUrl', 'citationUrl', 'authors', 'myAuthorRole', 'thumbnailImage', 'views', 'impressionCount', 'shareCount', 'isFeatured', 'status'];

    protected $casts = [
        'publishedDate' => 'datetime',
        'authors' => 'array',
        'views' => 'integer',
        'impressionCount' => 'integer',
        'shareCount' => 'integer',
        'isFeatured' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
