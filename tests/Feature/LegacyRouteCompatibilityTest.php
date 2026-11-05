<?php

namespace Tests\Feature;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class LegacyRouteCompatibilityTest extends TestCase
{
    public function test_representative_legacy_endpoints_are_registered(): void
    {
        $routes = [
            ['GET', '/api/site/home'],
            ['GET', '/api/site/projects/example-project'],
            ['GET', '/api/site/blogs'],
            ['GET', '/api/research-publications'],
            ['POST', '/api/research-publications/example/comments'],
            ['GET', '/api/admin/dashboard'],
            ['GET', '/api/admin/live-events'],
            ['GET', '/api/site/contact-ticket/1/events'],
            ['POST', '/api/admin/messages/1/replies'],
            ['GET', '/api/admin/research-publications/1'],
            ['POST', '/api/admin/research-publications'],
            ['PUT', '/api/admin/research-publications/1'],
            ['DELETE', '/api/admin/research-publications/1'],
            ['GET', '/api/admin/job-agent/gmail/status'],
            ['POST', '/api/admin/job-agent/email/send/1'],
        ];

        foreach ($routes as [$method, $path]) {
            $matched = Route::getRoutes()->match(Request::create($path, $method));
            $this->assertNotNull($matched, $method.' '.$path.' was not registered');
        }
    }
}
