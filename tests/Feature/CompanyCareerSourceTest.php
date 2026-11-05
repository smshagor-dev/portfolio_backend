<?php

namespace Tests\Feature;

use App\Services\CompanyCareerSourceService;
use PHPUnit\Framework\TestCase;

class CompanyCareerSourceTest extends TestCase
{
    public function test_lever_and_greenhouse_urls_are_normalized_to_fixed_apis(): void
    {
        $this->assertSame([
            'provider' => 'LEVER',
            'apiUrl' => 'https://api.lever.co/v0/postings/exampleco?mode=json',
        ], CompanyCareerSourceService::recognize('https://jobs.lever.co/exampleco/position-id'));

        $this->assertSame([
            'provider' => 'GREENHOUSE',
            'apiUrl' => 'https://boards-api.greenhouse.io/v1/boards/exampleco/jobs?content=true',
        ], CompanyCareerSourceService::recognize('https://boards.greenhouse.io/exampleco'));
    }

    public function test_custom_hosts_and_credentials_are_not_crawled(): void
    {
        $this->assertNull(CompanyCareerSourceService::recognize('https://example.com/company/jobs'));
        $this->assertNull(CompanyCareerSourceService::recognize('http://jobs.lever.co/exampleco'));
        $this->assertNull(CompanyCareerSourceService::recognize('https://jobs.lever.co.evil.test/exampleco'));
        $this->assertNull(CompanyCareerSourceService::recognize('https://user:password@jobs.lever.co/exampleco'));
        $this->assertNull(CompanyCareerSourceService::recognize('https://jobs.lever.co:444/exampleco'));
    }
}
