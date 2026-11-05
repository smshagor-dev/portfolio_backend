<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class StatusController extends Controller
{
    public function health(): JsonResponse
    {
        return response()->json(['status' => 'ok', 'message' => 'server ready']);
    }
}
