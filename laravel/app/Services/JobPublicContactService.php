<?php

namespace App\Services;

use App\Models\JobPost;
use App\Models\RecruiterContact;
use Illuminate\Support\Str;

/**
 * Conservative, network-free discovery from already imported public job text.
 * Does not scrape web pages, query private directories, or trust arbitrary
 * administrator-supplied URLs as a network destination.
 */
final class JobPublicContactService
{
    private const BLOCKED_DOMAINS = [
        'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com',
        'hotmail.com', 'live.com', 'icloud.com', 'aol.com',
        'linkedin.com', 'indeed.com', 'glassdoor.com', 'remoteok.com',
        'remotive.com', 'lever.co', 'greenhouse.io',
    ];

    private static function knownCompanyHosts(JobPost $job): array
    {
        $hosts = [];
        foreach ([(string) $job->companyUrl, (string) $job->applyUrl] as $url) {
            if (parse_url($url, PHP_URL_SCHEME) !== 'https') {
                continue;
            }
            $host = strtolower((string) parse_url($url, PHP_URL_HOST));
            if ($host === '' || filter_var($host, FILTER_VALIDATE_IP)) {
                continue;
            }
            $host = preg_replace('/^www\./', '', $host);
            if (in_array($host, self::BLOCKED_DOMAINS, true) ||
                preg_match('/(?:^|\.)(linkedin\.com|indeed\.com|greenhouse\.io|lever\.co)$/', $host)) {
                continue;
            }
            $hosts[] = $host;
        }
        return array_unique($hosts);
    }

    public function evaluate(string $email, JobPost $job): array
    {
        $email = strtolower(trim($email));
        $domain = substr(strrchr($email, '@') ?: '', 1);
        $reasons = [];
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 191) {
            $reasons[] = 'Invalid email address';
        }
        if (preg_match('/(?:^|[._-])(no-?reply|donotreply|automated|notifications?)(?:[._-]|@)/i', $email)) {
            $reasons[] = 'Automated or no-reply address';
        }
        if (in_array($domain, self::BLOCKED_DOMAINS, true)) {
            $reasons[] = 'Personal or job-platform email domain';
        }
        $hosts = self::knownCompanyHosts($job);
        if (!$hosts || !array_filter($hosts, fn ($host) => $domain === $host ||
            str_ends_with($domain, '.'.$host))) {
            $reasons[] = 'Cannot verify domain against original company URL';
        }
        return [
            'accepted' => !$reasons,
            'confidenceScore' => !$reasons ? 70 : 0,
            'companyDomain' => $domain,
            'reasons' => $reasons,
        ];
    }

    public function discover(JobPost $job): array
    {
        $text = Str::limit(strip_tags((string) $job->description."\n".(string) $job->rawContent), 200000, '');
        preg_match_all('/[A-Z0-9._%+\-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/i', $text, $found);
        $emails = array_slice(array_unique(array_map('strtolower', $found[0] ?? [])), 0, 30);
        $contacts = [];
        foreach ($emails as $email) {
            $validation = $this->evaluate($email, $job);
            if (!$validation['accepted']) {
                continue;
            }
            $existing = RecruiterContact::where('jobPostId', $job->id)->where('email', $email)->first();
            $contact = $existing ?: RecruiterContact::create([
                'jobPostId' => $job->id,
                'name' => '',
                'email' => $email,
                'companyName' => (string) $job->company,
                'companyDomain' => $validation['companyDomain'],
                'source' => 'public_job_description',
                'sourceUrl' => (string) ($job->applyUrl ?: $job->companyUrl),
                'discoveryMethod' => 'imported_public_job_text',
                'validationStatus' => 'valid',
                'contactEmailStatus' => 'pending',
                'confidenceScore' => $validation['confidenceScore'],
                'verified' => false,
                'verification' => 'pending_admin_review',
                'evidence' => ['type' => 'imported_public_job_description'],
                'lastVerifiedAt' => now(),
                'errorMessage' => '',
            ]);
            $contacts[] = $contact;
        }
        $job->forceFill([
            'contactDiscoveryStatus' => $contacts ? 'completed' : 'no_results',
            'contactDiscoveryError' => $contacts ? '' : 'No company-domain email in imported public job text.',
            'lastContactDiscoveryAt' => now(),
        ])->save();
        return [
            'contacts' => $contacts,
            'contactDiscoveryStatus' => $job->contactDiscoveryStatus,
            'errorMessage' => (string) $job->contactDiscoveryError,
            'requiresManualApproval' => true,
            'discoveryMethod' => 'imported_public_job_text',
        ];
    }
}
