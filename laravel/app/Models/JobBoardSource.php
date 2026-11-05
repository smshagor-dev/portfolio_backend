<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobBoardSource extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_board_sources';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['sourceName', 'companyName', 'region', 'sourceType', 'baseUrl', 'careersUrl', 'detectedProvider', 'extractionStatus', 'extractionMessage', 'selectorConfigJson', 'lastImportStatsJson', 'enabled', 'notes', 'requiresApiKey', 'apiKeyEncrypted', 'lastSyncAt', 'status'];

    protected $casts = [


        'enabled' => 'boolean',
        'requiresApiKey' => 'boolean',
        'lastSyncAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
