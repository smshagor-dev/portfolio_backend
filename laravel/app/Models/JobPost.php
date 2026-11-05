<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobPost extends Model
{
    protected $table = 'job_posts';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['sourceId', 'sourceType', 'externalId', 'sourceEmail', 'sourceSubject', 'sourcePlatform', 'emailSubject', 'title', 'company', 'location', 'sourceUrl', 'applyUrl', 'companyUrl', 'extractedUrls', 'jobType', 'workMode', 'region', 'experienceLevel', 'sourceName', 'importMethod', 'descriptionStatus', 'searchKeywordMatched', 'description', 'rawContent', 'status', 'contactDiscoveryStatus', 'contactDiscoveryError', 'lastContactDiscoveryAt', 'receivedAt'];

    protected $casts = [
        'sourceId' => 'integer',
        'extractedUrls' => 'array',
        'lastContactDiscoveryAt' => 'datetime',
        'receivedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
