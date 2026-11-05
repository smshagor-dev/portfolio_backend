<?php

namespace Tests\Feature;

use App\Services\GmailJobAlertService;
use PHPUnit\Framework\TestCase;

class GmailSenderValidationTest extends TestCase
{
    public function test_only_exact_approved_sender_domains_match(): void
    {
        $this->assertTrue(GmailJobAlertService::isApprovedSender('LinkedIn <jobs@linkedin.com>'));
        $this->assertTrue(GmailJobAlertService::isApprovedSender('alerts@indeed.com'));
        $this->assertFalse(GmailJobAlertService::isApprovedSender('Fake <alert@linkedin.com.evil.example>'));
        $this->assertFalse(GmailJobAlertService::isApprovedSender('"linkedin.com" <attacker@example.test>'));
        $this->assertFalse(GmailJobAlertService::isApprovedSender('alerts@linkedin.com.attacker.test'));
    }
}
