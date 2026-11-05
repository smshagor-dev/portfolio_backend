<?php

namespace App\Http\Controllers\Api;

use App\Models\SiteSettings;
use App\Services\LegacyFtpStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class UploadController extends Controller
{
    public function publicImage(Request $request, LegacyFtpStorage $ftp): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:5120'],
        ]);
        $stored = $ftp->uploadPublic($request->file('image'), 'image');
        return response()->json([
            'message' => 'Image uploaded successfully.',
            'path' => $stored['path'],
            'publicUrl' => $stored['publicUrl'],
        ], 201);
    }

    public function image(Request $request, LegacyFtpStorage $ftp): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:5120'],
        ]);
        $stored = $ftp->uploadPublic($request->file('image'), 'profile-image');
        return response()->json([
            'message' => 'Image uploaded successfully.',
            'path' => $stored['path'],
            'publicUrl' => $stored['publicUrl'],
        ], 201);
    }

    public function resume(Request $request, LegacyFtpStorage $ftp): JsonResponse
    {
        $request->validate([
            'resume' => ['required', 'file', 'mimes:pdf', 'max:10240'],
        ]);
        $stored = $ftp->uploadPublic($request->file('resume'), 'resume');
        return response()->json([
            'message' => 'Resume uploaded successfully.',
            'path' => $stored['path'],
            'publicUrl' => $stored['publicUrl'],
        ], 201);
    }

    public function verification(Request $request, LegacyFtpStorage $ftp): JsonResponse
    {
        $request->validate([
            'verificationFile' => ['required', 'file', 'mimes:html,txt', 'max:1024'],
        ]);
        $file = $request->file('verificationFile');
        $name = $file->getClientOriginalName();
        $body = file_get_contents($file->getRealPath());
        // Root-level verification files are active web content; only publish
        // narrowly scoped Google text verification, never arbitrary HTML.
        abort_unless(
            preg_match('/^google[a-zA-Z0-9_-]+\.html$/D', $name)
            && is_string($body)
            && preg_match('/^google-site-verification:\s*google[a-zA-Z0-9_-]+\.html\s*$/D', trim($body)),
            422,
            'Only plain-text Google verification HTML files can be published to the FTP web root.'
        );
        $stored = $ftp->uploadPublic($file, 'google-verification', '', true);
        $canonical = rtrim((string) (SiteSettings::find(1)?->canonicalUrl ?? ''), '/');
        $publicUrl = $canonical !== '' && filter_var($canonical, FILTER_VALIDATE_URL)
            ? $canonical.$stored['path']
            : $stored['publicUrl'];
        return response()->json([
            'message' => 'Verification file uploaded successfully.',
            'path' => $stored['path'],
            'publicUrl' => $publicUrl,
        ], 201);
    }
}
