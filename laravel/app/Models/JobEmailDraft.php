<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobEmailDraft extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_email_drafts';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['jobPostId', 'recruiterContactId', 'toEmail', 'subject', 'body', 'trackingId', 'aiProvider', 'aiModel', 'emailPromptUsed', 'coverLetterPromptUsed', 'coverLetterText', 'coverLetterPdfUrl', 'cvUrl', 'adminApprovalRequired', 'approvalStatus', 'status', 'approvedAt', 'approvedBy', 'rejectedAt', 'rejectionReason', 'sentAt', 'openedAt', 'lastOpenedAt', 'openCount', 'clickedAt', 'clickCount', 'providerMessageId', 'sendStatus', 'skipReason', 'errorMessage', 'lastSendAttemptAt'];

    protected $casts = [
        'jobPostId' => 'integer',
        'recruiterContactId' => 'integer',
        'adminApprovalRequired' => 'boolean',
        'approvedAt' => 'datetime',
        'rejectedAt' => 'datetime',
        'sentAt' => 'datetime',
        'openedAt' => 'datetime',
        'lastOpenedAt' => 'datetime',
        'openCount' => 'integer',
        'clickedAt' => 'datetime',
        'clickCount' => 'integer',
        'lastSendAttemptAt' => 'datetime',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
