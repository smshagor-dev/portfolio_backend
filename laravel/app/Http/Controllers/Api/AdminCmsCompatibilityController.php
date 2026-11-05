<?php

namespace App\Http\Controllers\Api;

use App\Models\Article;
use App\Models\ArticleCategory;
use App\Models\EmergencyContact;
use App\Models\Project;
use App\Services\PortfolioAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

class AdminCmsCompatibilityController extends Controller
{
    public function articles(): JsonResponse
    {
        return response()->json(['articles' => Article::orderByDesc('createdAt')->limit(200)->get()]);
    }

    public function article(int $articleId): JsonResponse
    {
        return response()->json(['article' => Article::findOrFail($articleId)]);
    }

    public function categories(): JsonResponse
    {
        return response()->json(['categories' => ArticleCategory::orderBy('name')->get()]);
    }

    public function saveCategory(Request $request, ?int $id = null): JsonResponse
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'slug' => ['sometimes', 'string', 'max:191'],
        ]);
        $entry = $id ? ArticleCategory::findOrFail($id) : new ArticleCategory();
        $input['slug'] = Str::slug($input['slug'] ?? $input['name']);
        $entry->fill($input)->save();
        return response()->json(['message' => 'Category saved.', 'category' => $entry], $id ? 200 : 201);
    }

    public function deleteCategory(int $id): JsonResponse
    {
        ArticleCategory::findOrFail($id)->delete();
        return response()->json(['message' => 'Category deleted.']);
    }

    public function emergencyContacts(): JsonResponse
    {
        return response()->json(['contacts' => EmergencyContact::orderBy('sortOrder')->get()]);
    }

    public function saveEmergencyContact(Request $request, ?int $id = null): JsonResponse
    {
        $input = $request->validate([
            'label' => ['required', 'string', 'max:191'],
            'name' => ['required', 'string', 'max:191'],
            'icon' => ['required', 'string', 'max:191'],
            'link' => ['required', 'string', 'max:1000'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
        ]);
        $entry = $id ? EmergencyContact::findOrFail($id) : new EmergencyContact();
        $entry->fill($input)->save();
        return response()->json(['message' => 'Contact saved.', 'contact' => $entry], $id ? 200 : 201);
    }

    public function deleteEmergencyContact(int $id): JsonResponse
    {
        EmergencyContact::findOrFail($id)->delete();
        return response()->json(['message' => 'Contact deleted.']);
    }

    public function saveProject(Request $request, ?int $id = null): JsonResponse
    {
        $input = $request->validate([
            'slug' => ['sometimes', 'string', 'max:191', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'name' => ['required', 'string', 'max:191'],
            'description' => ['required', 'string', 'max:5000'],
            'content' => ['sometimes', 'string', 'max:100000'],
            'tools' => ['sometimes', 'array'],
            'role' => ['sometimes', 'string', 'max:191'],
            'code' => ['sometimes', 'string', 'max:1000'],
            'demo' => ['sometimes', 'string', 'max:1000'],
            'image' => ['sometimes', 'string', 'max:1000'],
            'buttons' => ['sometimes', 'array'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
        ]);
        $entry = $id ? Project::findOrFail($id) : new Project();
        $input['slug'] = Str::slug($input['slug'] ?? $input['name']);
        if (!$id) {
            $input['sortOrder'] ??= (int) Project::max('sortOrder') + 1;
            $input['tools'] ??= [];
            $input['role'] ??= '';
            $input['code'] ??= '';
            $input['demo'] ??= '';
            $input['content'] ??= '';
        }
        $entry->fill($input)->save();
        return response()->json(['message' => 'Project saved.', 'project' => $entry], $id ? 200 : 201);
    }

    public function deleteProject(int $id): JsonResponse
    {
        Project::findOrFail($id)->delete();
        return response()->json(['message' => 'Project deleted.']);
    }

    public function generateArticle(Request $request, PortfolioAiService $ai): JsonResponse
    {
        $input = $request->validate([
            'prompt' => ['required', 'string', 'min:10', 'max:2500'],
            'category' => ['sometimes', 'string', 'max:191'],
        ]);
        try {
            $content = $ai->reply(
                'Write an accurate, useful draft article for this portfolio. Do not invent citations or results. '
                .'Return article body in Markdown only, no fabricated references. Topic: '.$input['prompt']
            );
        } catch (\Throwable $exception) {
            report($exception);
            return response()->json(['message' => 'Article generation unavailable.'], 503);
        }
        $title = Str::limit($input['prompt'], 120, '');
        return response()->json([
            'title' => $title, 'slug' => Str::slug($title),
            'content' => $content, 'shortDescription' => Str::limit(strip_tags($content), 280),
            'category' => $input['category'] ?? '', 'status' => 'draft',
        ]);
    }
}
