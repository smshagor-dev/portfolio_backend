<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class SiteSettings extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'SiteSettings';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['websiteTitle', 'websiteDescription', 'navTitle', 'navSubtitle', 'seoTitle', 'seoDescription', 'seoKeywords', 'seoImage', 'websiteIcon', 'heroHeaderText', 'heroDescription', 'heroImage', 'contactEmail', 'mobileNumber', 'footerText', 'founderProjects', 'founderSection', 'privacyPolicyHtml', 'termsConditionsHtml', 'canonicalUrl', 'googleSiteVerification', 'googleVerificationFilePath', 'googleAnalyticsId', 'googleTagManagerId', 'adsenseHeadCode', 'adsensePageTopCode', 'adsenseBetweenSectionsCode', 'adsensePageBottomCode', 'robotsIndexingEnabled', 'robotsFollowEnabled', 'smtpHost', 'smtpPort', 'smtpUser', 'smtpSecure', 'smtpFromEmail', 'smtpFromName', 'smtpReplyToEmail', 'smtpToEmail'];
    protected $hidden = ['smtpPass'];

    protected $casts = [
        'founderProjects' => 'array',
        'founderSection' => 'array',
        'robotsIndexingEnabled' => 'boolean',
        'robotsFollowEnabled' => 'boolean',
        'smtpPort' => 'integer',
        'smtpSecure' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
