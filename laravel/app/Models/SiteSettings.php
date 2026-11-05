<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SiteSettings extends Model
{
    protected $table = 'site_settings';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['websiteTitle', 'websiteDescription', 'navTitle', 'navSubtitle', 'seoTitle', 'seoDescription', 'seoKeywords', 'seoImage', 'websiteIcon', 'heroHeaderText', 'heroDescription', 'heroImage', 'contactEmail', 'mobileNumber', 'footerText', 'privacyPolicyHtml', 'termsConditionsHtml', 'canonicalUrl', 'googleSiteVerification', 'googleVerificationFilePath', 'googleAnalyticsId', 'googleTagManagerId', 'adsenseHeadCode', 'adsensePageTopCode', 'adsenseBetweenSectionsCode', 'adsensePageBottomCode', 'robotsIndexingEnabled', 'robotsFollowEnabled', 'smtpHost', 'smtpPort', 'smtpUser', 'smtpSecure', 'smtpFromEmail', 'smtpFromName', 'smtpReplyToEmail', 'smtpToEmail'];
    protected $hidden = ['smtpPass'];

    protected $casts = [
        'robotsIndexingEnabled' => 'boolean',
        'robotsFollowEnabled' => 'boolean',
        'smtpPort' => 'integer',
        'smtpSecure' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
