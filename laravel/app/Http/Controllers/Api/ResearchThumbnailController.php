<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class ResearchThumbnailController extends Controller
{
    public function svg(): Response
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">'
            .'<rect width="1200" height="675" fill="#0b1728"/>'
            .'<rect x="365" y="90" width="470" height="495" rx="28" fill="#12243a" stroke="#66d9ff" stroke-width="3"/>'
            .'<path d="M435 205h330M435 255h285M435 305h310M435 420h330M435 470h250" '
            .'stroke="#9dc9e8" stroke-width="12" stroke-linecap="round" opacity=".62"/>'
            .'</svg>';
        return response($svg, 200, [
            'Content-Type' => 'image/svg+xml',
            'Cache-Control' => 'public, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
