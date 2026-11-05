<?php

namespace App\Http\Controllers\Api;

use App\Models\ResearchPublication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ResearchController extends Controller
{
    private function query(Request $request)
    {
        $query = ResearchPublication::query()->where('status', 'published');
        foreach (['publicationType', 'researchArea'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->string($field)->toString());
            }
        }
        if ($request->boolean('featured')) {
            $query->where('isFeatured', true);
        }
        if ($request->filled('search')) {
            $search = '%'.addcslashes($request->string('search')->toString(), '%_\\').'%';
            $query->where(function ($q) use ($search): void {
                foreach (['title', 'shortSummary', 'researchArea', 'publisherName', 'doi'] as $field) {
                    $q->orWhere($field, 'like', $search);
                }
            });
        }
        return $query;
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'publicationType' => ['sometimes', 'string', 'max:191'],
            'researchArea' => ['sometimes', 'string', 'max:191'],
            'search' => ['sometimes', 'string', 'max:200'],
            'featured' => ['sometimes', 'string'],
        ]);
        $page = max(1, (int) ($data['page'] ?? 1));
        $limit = min(50, max(1, (int) ($data['limit'] ?? 9)));
        $publications = $this->query($request)->with('comments.replies')
            ->orderByDesc('publishedDate')->orderByDesc('createdAt')->paginate($limit, ['*'], 'page', $page);
        return response()->json([
            'success' => true,
            'message' => 'Research publications loaded successfully.',
            'data' => $publications->items(),
            'pagination' => ['page' => $page, 'limit' => $limit, 'total' => $publications->total(), 'totalPages' => max(1, $publications->lastPage())],
            'filters' => [
                'search' => $request->input('search', ''),
                'publicationType' => $request->input('publicationType', ''),
                'researchArea' => $request->input('researchArea', ''),
                'featured' => $request->input('featured', ''),
            ],
            'options' => [
                'publicationTypes' => ResearchPublication::where('status', 'published')->distinct()->orderBy('publicationType')->pluck('publicationType'),
                'researchAreas' => ResearchPublication::where('status', 'published')->distinct()->orderBy('researchArea')->pluck('researchArea'),
            ],
        ]);
    }

    public function featured(): JsonResponse
    {
        return response()->json([
            'success' => true, 'message' => 'Featured research publications loaded successfully.',
            'data' => ResearchPublication::where('status', 'published')->where('isFeatured', true)->with('comments.replies')->orderByDesc('publishedDate')->get(),
        ]);
    }

    public function show(string $slug): JsonResponse
    {
        $record = ResearchPublication::where('slug', $slug)->where('status', 'published')->with('comments.replies')->first();
        if (!$record) {
            return response()->json(['success' => false, 'message' => 'Research publication not found.', 'data' => null], 404);
        }
        $record->increment('views');
        return response()->json(['success' => true, 'message' => 'Research publication loaded successfully.', 'data' => $record->fresh()->load('comments.replies')]);
    }

    public function impression(string $slug): JsonResponse
    {
        $count = ResearchPublication::where('slug', $slug)->where('status', 'published')->increment('impressionCount');
        return response()->json(['success' => $count > 0]);
    }

    public function share(string $slug): JsonResponse
    {
        $count = ResearchPublication::where('slug', $slug)->where('status', 'published')->increment('shareCount');
        return response()->json(['success' => $count > 0]);
    }
}
