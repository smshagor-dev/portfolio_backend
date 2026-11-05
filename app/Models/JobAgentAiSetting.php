<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class JobAgentAiSetting extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'job_agent_ai_settings';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['aiProvider', 'aiModel', 'deepseekApiKeyEncrypted', 'geminiApiKeyEncrypted', 'openaiApiKeyEncrypted', 'fallbackProvider', 'fallbackEnabled', 'systemPrompt', 'recruiterEmailPrompt', 'coverLetterPrompt', 'tone', 'maxEmailWords', 'maxCoverLetterWords', 'requireAdminApproval', 'attachCv', 'attachCoverLetterPdf', 'autoGenerateCoverLetter'];

    protected $hidden = ['deepseekApiKeyEncrypted', 'geminiApiKeyEncrypted', 'openaiApiKeyEncrypted'];

    protected $casts = [
        'fallbackEnabled' => 'boolean',
        'maxEmailWords' => 'integer',
        'maxCoverLetterWords' => 'integer',
        'requireAdminApproval' => 'boolean',
        'attachCv' => 'boolean',
        'attachCoverLetterPdf' => 'boolean',
        'autoGenerateCoverLetter' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
