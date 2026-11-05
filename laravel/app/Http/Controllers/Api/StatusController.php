<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class StatusController extends Controller
{
    public function health(): JsonResponse
    {
        $started = microtime(true);
        $response = [
            'service' => 'Portfolio API',
            'api' => 'online',
            'database' => 'unavailable',
            'driver' => 'mongodb',
            'status' => 'unavailable',
            'timestamp' => now()->toIso8601String(),
        ];

        try {
            $dsn = (string) config('database.connections.mongodb.dsn', '');
            $database = (string) config('database.connections.mongodb.database', '');
            if (!$dsn || !$database || $database === 'REPLACE_WITH_EXISTING_DATABASE_NAME') {
                throw new \RuntimeException('MongoDB configuration incomplete');
            }
            // Force the driver cursor to execute the read-only ping.
            DB::connection('mongodb')->getMongoClient()
                ->selectDatabase($database)
                ->command(['ping' => 1])->toArray();

            $response['database'] = 'connected';
            $response['status'] = 'ok';
            $response['latencyMs'] = (int) round((microtime(true) - $started) * 1000);
            return response()->json($response, 200, ['Cache-Control' => 'no-store']);
        } catch (\Throwable $error) {
            report($error);
            $response['latencyMs'] = (int) round((microtime(true) - $started) * 1000);
            // Never expose Atlas hosts, passwords, URIs, or raw driver exceptions.
            return response()->json($response, 503, ['Cache-Control' => 'no-store']);
        }
    }
}
