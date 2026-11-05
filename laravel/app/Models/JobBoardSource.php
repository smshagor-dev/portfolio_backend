<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobBoardSource extends Model
{
    protected $table = 'job_board_sources';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['sourceName', 'companyName', 'region', 'sourceType', 'baseUrl', 'careersUrl', 'detectedProvider', 'extractionStatus', 'extractionMessage', 'selectorConfigJson', 'lastImportStatsJson', 'enabled', 'notes', 'requiresApiKey', 'apiKeyEncrypted', 'lastSyncAt', 'status'];

    protected $casts = [
        'selectorConfigJson' => 'array',
        'lastImportStatsJson' => 'array',
        'enabled' => 'boolean',
        'requiresApiKey' => 'boolean',
        'lastSyncAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
