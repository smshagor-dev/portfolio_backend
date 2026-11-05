<?php

namespace Database\Seeders;

use App\Models\SiteSettings;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Non-destructive: settings are only created if missing. No seeded admin credentials.
        if (SiteSettings::find(1)) {
            return;
        }
        $defaults = [
            'websiteTitle' => 'Portfolio Website', 'websiteDescription' => 'Professional portfolio website.',
            'navTitle' => 'Portfolio Website', 'navSubtitle' => 'Software Developer',
            'seoTitle' => 'Portfolio Website', 'seoDescription' => 'Professional portfolio website.',
            'seoKeywords' => 'portfolio', 'seoImage' => '/profile.png', 'websiteIcon' => '/favicon.ico',
            'heroHeaderText' => '', 'heroDescription' => '', 'heroImage' => '',
            'contactEmail' => '', 'mobileNumber' => '', 'footerText' => 'All rights reserved.',
            'privacyPolicyHtml' => '', 'termsConditionsHtml' => '', 'canonicalUrl' => config('app.url'),
            'googleSiteVerification' => '', 'googleVerificationFilePath' => '',
            'googleAnalyticsId' => '', 'googleTagManagerId' => '',
            'adsenseHeadCode' => '', 'adsensePageTopCode' => '', 'adsenseBetweenSectionsCode' => '',
            'adsensePageBottomCode' => '', 'robotsIndexingEnabled' => true, 'robotsFollowEnabled' => true,
            'smtpHost' => '', 'smtpPort' => 587, 'smtpUser' => '', 'smtpPass' => '',
            'smtpSecure' => false, 'smtpFromEmail' => '', 'smtpFromName' => '',
            'smtpReplyToEmail' => '', 'smtpToEmail' => '',
        ];
        $settings = new SiteSettings();
        $settings->id = 1;
        $settings->forceFill($defaults)->save();
    }
}
