<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobSource extends Model
{
    protected $table = 'job_sources';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'type', 'provider', 'status', 'config', 'lastSyncedAt'];

    protected $casts = [
        'config' => 'array',
        'lastSyncedAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
