<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobSource extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_sources';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'type', 'provider', 'status', 'config', 'lastSyncedAt'];

    protected $casts = [

        'lastSyncedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
