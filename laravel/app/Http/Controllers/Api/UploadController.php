<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;

class UploadController extends Controller
{
    public function publicImage(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);
        $path = $request->file('image')->store('uploads/feedback', 'public');
        return response()->json([
            'message' => 'Image uploaded successfully.',
            'path' => '/storage/'.$path,
            'publicUrl' => Storage::disk('public')->url($path),
        ], 201);
    }

    public function image(Request $request): JsonResponse
    {
        $request->validate(['image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:5120']]);
        $path = $request->file('image')->store('uploads', 'public');
        return response()->json([
            'message' => 'Image uploaded successfully.',
            'path' => '/storage/'.$path,
            'publicUrl' => Storage::disk('public')->url($path),
        ], 201);
    }

    public function resume(Request $request): JsonResponse
    {
        $request->validate(['resume' => ['required', 'file', 'mimes:pdf', 'max:10240']]);
        $path = $request->file('resume')->store('resumes', 'public');
        return response()->json([
            'message' => 'Resume uploaded successfully.',
            'path' => '/storage/'.$path,
            'publicUrl' => Storage::disk('public')->url($path),
        ], 201);
    }

    public function verification(Request $request): JsonResponse
    {
        $request->validate([
            'verificationFile' => ['required', 'file', 'mimes:html,txt', 'max:1024'],
        ]);
        // Stored privately; manual approval required before any root-level placement.
        $path = $request->file('verificationFile')->store('verification-pending', 'local');
        return response()->json([
            'message' => 'Verification file saved for review. It has not been published.',
            'path' => $path,
        ], 201);
    }
}
