<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobSourceImportRun extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_source_import_runs';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = false;
    protected $fillable = ['sourceId', 'status', 'startedAt', 'finishedAt', 'importedCount', 'duplicateCount', 'needsDescriptionCount', 'errorMessage'];

    protected $casts = [
        'sourceId' => 'integer',
        'startedAt' => 'datetime',
        'finishedAt' => 'datetime',
        'importedCount' => 'integer',
        'duplicateCount' => 'integer',
        'needsDescriptionCount' => 'integer',
        'createdAt' => 'datetime',
    ];
}
