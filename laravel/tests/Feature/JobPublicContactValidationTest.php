<?php

namespace Tests\Feature;

use App\Models\JobPost;
use App\Services\JobPublicContactService;
use Tests\TestCase;

class JobPublicContactValidationTest extends TestCase
{
    public function test_known_company_domain_is_accepted_but_not_auto_approved(): void
    {
        $job = new JobPost();
        $job->companyUrl = 'https://example-company.org/careers';
        $service = new JobPublicContactService();
        $result = $service->evaluate('hiring@example-company.org', $job);
        $this->assertTrue($result['accepted']);
        $this->assertSame(70, $result['confidenceScore']);
    }

    public function test_free_mail_and_unrelated_domains_are_rejected(): void
    {
        $job = new JobPost();
        $job->companyUrl = 'https://example-company.org/careers';
        $service = new JobPublicContactService();
        $this->assertFalse($service->evaluate('recruiter@gmail.com', $job)['accepted']);
        $this->assertFalse($service->evaluate('recruiter@unrelated.example', $job)['accepted']);
        $this->assertFalse($service->evaluate('no-reply@example-company.org', $job)['accepted']);
    }
}
