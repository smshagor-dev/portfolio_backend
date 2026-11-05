<?php

namespace App\Http\Controllers\Api;

use App\Models\LinkedInPost;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class LinkedInPostsController extends Controller
{
    private const DEFAULT_ID = 'linkedin-default-7502991980113838081';
    private const DEFAULT_URL = 'https://www.linkedin.com/embed/feed/update/urn:li:share:7502991980113838081?collapsed=1';

    /** Only allow LinkedIn's first-party post embeds, never arbitrary iframe HTML. */
    public static function normalizeEmbed(string $value): ?string
    {
        $value = trim($value);
        if (preg_match('~<iframe\b[^>]*\bsrc=["\x27]([^"\x27]+)["\x27]~i', $value, $match)) {
            $value = $match[1];
        }
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $parts = parse_url($value);
        if (!is_array($parts) || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['https'], true) ||
            !in_array(strtolower((string) ($parts['host'] ?? '')), ['linkedin.com', 'www.linkedin.com'], true) ||
            isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            return null;
        }
        $path = $parts['path'] ?? '';
        if (!preg_match('~^/embed/feed/update/urn:li:(share|activity|ugcpost):\d+/?$~iD', $path)) {
            return null;
        }
        $query = [];
        parse_str((string) ($parts['query'] ?? ''), $query);
        return 'https://www.linkedin.com'.rtrim($path, '/').(!empty($query['collapsed']) ? '?collapsed=1' : '');
    }

    private static function postUrl(string $embedUrl): string
    {
        return str_replace('/embed/feed/update/', '/feed/update/', explode('?', $embedUrl, 2)[0]).'/';
    }

    private static function serialize(LinkedInPost $post): array
    {
        $url = self::normalizeEmbed((string) $post->embedUrl) ?: '';
        return [
            'id' => (string) $post->getKey(), 'title' => (string) ($post->title ?: 'LinkedIn Post'),
            'embedUrl' => $url,
            'postUrl' => self::postUrl($url),
            'status' => (bool) $post->status,
            'sortOrder' => (int) ($post->sortOrder ?: 1),
            'createdAt' => $post->createdAt, 'updatedAt' => $post->updatedAt,
        ];
    }

    private static function posts()
    {
        if (!LinkedInPost::query()->exists()) {
            LinkedInPost::firstOrCreate(['id' => self::DEFAULT_ID], [
                'title' => 'Featured LinkedIn Post',
                'embedUrl' => self::DEFAULT_URL,
                'postUrl' => self::postUrl(self::DEFAULT_URL),
                'status' => true,
                'sortOrder' => 1,
            ]);
        }
        return LinkedInPost::orderBy('sortOrder')->orderByDesc('createdAt')->limit(100)->get();
    }

    public function publicIndex(): JsonResponse
    {
        $posts = self::posts()->filter(fn (LinkedInPost $post) =>
            $post->status && self::normalizeEmbed((string) $post->embedUrl)
        )->map(fn (LinkedInPost $post) => self::serialize($post))->values();
        return response()->json(['success' => true, 'data' => $posts]);
    }

    public function adminIndex(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => self::posts()->map(
            fn (LinkedInPost $post) => self::serialize($post)
        )]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:140'],
            'embedUrl' => ['sometimes', 'string', 'max:3000'],
            'embedInput' => ['sometimes', 'string', 'max:3000'],
            'embedCode' => ['sometimes', 'string', 'max:3000'],
            'iframe' => ['sometimes', 'string', 'max:3000'],
            'status' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer', 'min:1', 'max:10000'],
        ]);
        $url = self::normalizeEmbed((string) ($data['embedUrl'] ?? $data['embedInput'] ?? $data['embedCode'] ?? $data['iframe'] ?? ''));
        if (!$url) {
            return response()->json(['success' => false, 'message' => 'Paste a valid LinkedIn embed URL or iframe code.'], 422);
        }
        $post = LinkedInPost::create([
            'title' => $data['title'] ?? 'LinkedIn Post',
            'embedUrl' => $url, 'postUrl' => self::postUrl($url),
            'status' => (bool) ($data['status'] ?? true),
            'sortOrder' => (int) ($data['sortOrder'] ?? 1),
        ]);
        return response()->json(['success' => true, 'message' => 'LinkedIn post added successfully.', 'data' => self::serialize($post)], 201);
    }

    public function update(Request $request, string $postId): JsonResponse
    {
        $post = LinkedInPost::findOrFail($postId);
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:140'],
            'embedUrl' => ['sometimes', 'string', 'max:3000'],
            'embedInput' => ['sometimes', 'string', 'max:3000'],
            'embedCode' => ['sometimes', 'string', 'max:3000'],
            'iframe' => ['sometimes', 'string', 'max:3000'],
            'status' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer', 'min:1', 'max:10000'],
        ]);
        $candidate = $data['embedUrl'] ?? $data['embedInput'] ?? $data['embedCode'] ?? $data['iframe'] ?? $post->embedUrl;
        $url = self::normalizeEmbed((string) $candidate);
        if (!$url) {
            return response()->json(['success' => false, 'message' => 'Paste a valid LinkedIn embed URL or iframe code.'], 422);
        }
        $post->fill([
            'title' => $data['title'] ?? $post->title,
            'embedUrl' => $url, 'postUrl' => self::postUrl($url),
            'status' => $data['status'] ?? $post->status,
            'sortOrder' => $data['sortOrder'] ?? $post->sortOrder,
        ])->save();
        return response()->json(['success' => true, 'message' => 'LinkedIn post updated successfully.', 'data' => self::serialize($post->fresh())]);
    }

    public function destroy(string $postId): JsonResponse
    {
        $post = LinkedInPost::findOrFail($postId);
        $previous = self::serialize($post);
        $post->delete();
        return response()->json(['success' => true, 'message' => 'LinkedIn post deleted successfully.', 'data' => $previous]);
    }
}
