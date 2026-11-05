<?php

namespace App\Http\Controllers\Api;

use App\Models\Article;
use App\Models\ArticleCategory;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ResearchPublication;
use App\Models\SiteSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ContentController extends Controller
{
    private function model(string $resource): ?string
    {
        return match ($resource) {
            'projects' => Project::class,
            'articles' => Article::class,
            'article-categories' => ArticleCategory::class,
            'research-publications' => ResearchPublication::class,
            default => null,
        };
    }

    private function allowed(string $resource): array
    {
        return match ($resource) {
            'projects' => ['slug', 'name', 'description', 'content', 'role', 'code', 'demo', 'image', 'views', 'impressionCount', 'buttons', 'tools', 'sortOrder'],
            'articles' => ['title', 'slug', 'shortDescription', 'content', 'category', 'tags', 'featuredImage', 'metaTitle', 'metaDescription', 'status', 'commentsEnabled', 'isFeatured', 'author', 'publishDate', 'sortOrder'],
            'article-categories' => ['name', 'slug'],
            'research-publications' => ['title', 'slug', 'shortSummary', 'content', 'publicationType', 'researchArea', 'publisherName', 'publishedDate', 'doi', 'publicationUrl', 'citationUrl', 'authors', 'myAuthorRole', 'thumbnailImage', 'isFeatured', 'status'],
            default => [],
        };
    }

    private function validatedPayload(Request $request, string $resource): array
    {
        $allowed = $this->allowed($resource);
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:191'],
            'name' => ['sometimes', 'string', 'max:191'],
            'slug' => ['sometimes', 'string', 'max:191', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'description' => ['sometimes', 'string', 'max:40000'],
            'shortDescription' => ['sometimes', 'string', 'max:10000'],
            'shortSummary' => ['sometimes', 'string', 'max:10000'],
            'content' => ['sometimes', 'string', 'max:200000'],
            'role' => ['sometimes', 'string', 'max:500'],
            'code' => ['sometimes', 'string', 'max:1000'],
            'demo' => ['sometimes', 'string', 'max:1000'],
            'image' => ['sometimes', 'string', 'max:1000'],
            'featuredImage' => ['sometimes', 'string', 'max:1000'],
            'thumbnailImage' => ['sometimes', 'string', 'max:1000'],
            'metaTitle' => ['sometimes', 'string', 'max:191'],
            'metaDescription' => ['sometimes', 'string', 'max:500'],
            'category' => ['sometimes', 'string', 'max:191'],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string', 'max:191'],
            'buttons' => ['sometimes', 'array'],
            'tools' => ['sometimes', 'string', 'max:1000'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
            'views' => ['sometimes', 'integer', 'min:0'],
            'impressionCount' => ['sometimes', 'integer', 'min:0'],
            'commentsEnabled' => ['sometimes', 'boolean'],
            'isFeatured' => ['sometimes', 'boolean'],
            'author' => ['sometimes', 'string', 'max:191'],
            'status' => ['sometimes', 'string', 'max:191'],
            'publishDate' => ['sometimes', 'nullable', 'date'],
            'publicationType' => ['sometimes', 'string', 'max:191'],
            'researchArea' => ['sometimes', 'string', 'max:191'],
            'publisherName' => ['sometimes', 'string', 'max:191'],
            'publishedDate' => ['sometimes', 'date'],
            'doi' => ['sometimes', 'string', 'max:191'],
            'publicationUrl' => ['sometimes', 'url', 'max:2000'],
            'citationUrl' => ['sometimes', 'nullable', 'url', 'max:2000'],
            'authors' => ['sometimes', 'string', 'max:10000'],
            'myAuthorRole' => ['sometimes', 'nullable', 'string', 'max:191'],
        ]);
        return array_intersect_key($data, array_flip($allowed));
    }

    public function index(string $resource): JsonResponse
    {
        $model = $this->model($resource);
        abort_unless($model, 404);
        return response()->json($model::query()->orderByDesc('id')->limit(200)->get());
    }

    public function show(string $resource, int $id): JsonResponse
    {
        $model = $this->model($resource);
        abort_unless($model, 404);
        return response()->json($model::findOrFail($id));
    }

    public function store(Request $request, string $resource): JsonResponse
    {
        $model = $this->model($resource);
        abort_unless($model, 404);
        $data = $this->validatedPayload($request, $resource);
        if (in_array('slug', $this->allowed($resource), true) && empty($data['slug'])) {
            $data['slug'] = Str::slug($data['title'] ?? $data['name'] ?? '');
        }
        if ($resource === 'articles') {
            $data += [
                'title' => '', 'shortDescription' => '', 'content' => '', 'category' => '',
                'metaDescription' => '', 'author' => '', 'status' => 'draft', 'tags' => [],
            ];
        }
        $record = $model::create($data);
        return response()->json(['message' => 'Created successfully.', 'data' => $record], 201);
    }

    public function update(Request $request, string $resource, int $id): JsonResponse
    {
        $model = $this->model($resource);
        abort_unless($model, 404);
        $record = $model::findOrFail($id);
        $payload = $this->validatedPayload($request, $resource);
        // Explicit editorial changes are authoritative over ORCID/Crossref sync.
        if ($resource === 'research-publications') {
            $original = (string) ($payload['content'] ?? $record->content ?? '');
            if (!str_contains($original, \App\Services\ResearchSyncService::OVERRIDE_MARKER)) {
                $payload['content'] = \App\Services\ResearchSyncService::OVERRIDE_MARKER."\n".$original;
            }
        }
        $record->update($payload);
        return response()->json(['message' => 'Updated successfully.', 'data' => $record->fresh()]);
    }

    public function destroy(string $resource, int $id): JsonResponse
    {
        $model = $this->model($resource);
        abort_unless($model, 404);
        $record = $model::findOrFail($id);
        $record->delete();
        return response()->json(['message' => 'Deleted successfully.']);
    }

    public function legalPages(): JsonResponse
    {
        return response()->json(SiteSettings::find(1)?->only(['privacyPolicyHtml', 'termsConditionsHtml']) ?? []);
    }

    public function updateLegalPages(Request $request): JsonResponse
    {
        $data = $request->validate([
            'privacyPolicyHtml' => ['sometimes', 'string', 'max:250000'],
            'termsConditionsHtml' => ['sometimes', 'string', 'max:250000'],
        ]);
        $settings = SiteSettings::firstOrNew(['id' => 1]);
        $settings->fill($data)->save();
        return response()->json(['message' => 'Legal pages updated.', 'data' => $settings->only(['privacyPolicyHtml', 'termsConditionsHtml'])]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:191'],
            'profile' => ['sometimes', 'required', 'string', 'max:191'],
            'designation' => ['sometimes', 'required', 'string', 'max:191'],
            'description' => ['sometimes', 'string', 'max:40000'],
            'email' => ['sometimes', 'email', 'max:191'],
            'phone' => ['sometimes', 'string', 'max:100'],
            'address' => ['sometimes', 'string', 'max:1000'],
        ]);
        $model = Profile::firstOrNew(['id' => 1]);
        $model->fill($data)->save();
        return response()->json(['message' => 'Profile updated.', 'data' => $model]);
    }
}
