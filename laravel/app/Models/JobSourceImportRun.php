<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobSourceImportRun extends Model
{
    protected $table = 'job_source_import_runs';
    protected $primaryKey = 'id';
    public $incrementing = true;
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
