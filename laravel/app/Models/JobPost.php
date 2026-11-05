<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobPost extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_posts';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['sourceId', 'sourceType', 'externalId', 'sourceEmail', 'sourceSubject', 'sourcePlatform', 'emailSubject', 'title', 'company', 'location', 'sourceUrl', 'applyUrl', 'companyUrl', 'extractedUrls', 'jobType', 'workMode', 'region', 'experienceLevel', 'sourceName', 'importMethod', 'descriptionStatus', 'searchKeywordMatched', 'description', 'rawContent', 'status', 'contactDiscoveryStatus', 'contactDiscoveryError', 'lastContactDiscoveryAt', 'receivedAt'];

    protected $casts = [
        'sourceId' => 'integer',

        'lastContactDiscoveryAt' => 'datetime',
        'receivedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
