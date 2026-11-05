<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RecruiterContact extends Model
{
    protected $table = 'recruiter_contacts';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['jobPostId', 'name', 'email', 'companyName', 'companyDomain', 'source', 'sourceUrl', 'discoveryMethod', 'validationStatus', 'contactEmailStatus', 'confidenceScore', 'isRecruiter', 'isHiringManager', 'evidence', 'lastVerifiedAt', 'errorMessage', 'verification', 'verified', 'publicContext'];

    protected $casts = [
        'jobPostId' => 'integer',
        'confidenceScore' => 'integer',
        'isRecruiter' => 'boolean',
        'isHiringManager' => 'boolean',
        'evidence' => 'array',
        'lastVerifiedAt' => 'datetime',
        'verified' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
