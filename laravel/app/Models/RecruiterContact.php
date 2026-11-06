<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class RecruiterContact extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'recruiter_contacts';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['jobPostId', 'name', 'email', 'companyName', 'companyDomain', 'source', 'sourceUrl', 'discoveryMethod', 'validationStatus', 'contactEmailStatus', 'confidenceScore', 'isRecruiter', 'isHiringManager', 'evidence', 'lastVerifiedAt', 'errorMessage', 'verification', 'verified', 'publicContext'];

    protected $casts = [
        'jobPostId' => 'integer',
        'confidenceScore' => 'integer',
        'isRecruiter' => 'boolean',
        'isHiringManager' => 'boolean',

        'lastVerifiedAt' => 'datetime',
        'verified' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
