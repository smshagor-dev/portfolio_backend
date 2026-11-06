<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RouteMethodIntegrityTest extends TestCase
{
    public function test_all_registered_api_controller_methods_exist(): void
    {
        foreach (Route::getRoutes() as $route) {
            if (!str_starts_with($route->uri(), 'api/')) {
                continue;
            }
            $action = $route->getActionName();
            if (!str_contains($action, '@')) {
                continue;
            }
            [$class, $method] = explode('@', $action, 2);
            $this->assertTrue(class_exists($class), 'Missing controller: '.$class);
            $this->assertTrue(method_exists($class, $method), 'Missing method: '.$action);
            $this->assertTrue((new \ReflectionMethod($class, $method))->isPublic(), 'Non-public action: '.$action);
        }
    }

    public function test_sensitive_admin_endpoints_have_sanctum_middleware(): void
    {
        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();
            if (!str_starts_with($uri, 'api/admin/') ||
                in_array($uri, ['api/admin/login', 'api/admin/job-agent/gmail/callback'], true)) {
                continue;
            }
            $middleware = $route->gatherMiddleware();
            $this->assertContains('auth:sanctum', $middleware, 'Unprotected admin endpoint: '.$uri);
        }
    }
}
