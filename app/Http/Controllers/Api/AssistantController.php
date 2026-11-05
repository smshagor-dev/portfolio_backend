<?php

namespace App\Http\Controllers\Api;

use App\Services\PortfolioAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class AssistantController extends Controller
{
    public function chat(Request $request, PortfolioAiService $ai): JsonResponse
    {
        $input = $request->validate(['message' => ['required', 'string', 'max:4000']]);
        try {
            return response()->json(['success' => true, 'answer' => $ai->reply($input['message'])]);
        } catch (\Throwable $exception) {
            report($exception);
            return response()->json(['success' => false, 'message' => 'Portfolio assistant is currently unavailable.'], 503);
        }
    }
}
