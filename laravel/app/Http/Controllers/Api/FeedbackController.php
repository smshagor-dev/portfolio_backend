<?php

namespace App\Http\Controllers\Api;

use App\Models\Article;
use App\Models\ArticleComment;
use App\Models\ArticleReply;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\ProjectReply;
use App\Models\ResearchComment;
use App\Models\ResearchPublication;
use App\Models\ResearchReply;
use App\Models\Service;
use App\Models\ServiceComment;
use App\Models\ServiceReply;
use App\Models\Testimonial;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class FeedbackController extends Controller
{
    private const TYPES = [
        'projects' => [Project::class, ProjectComment::class, ProjectReply::class, 'projectId'],
        'services' => [Service::class, ServiceComment::class, ServiceReply::class, 'serviceId'],
        'articles' => [Article::class, ArticleComment::class, ArticleReply::class, 'articleId'],
        'research-publications' => [ResearchPublication::class, ResearchComment::class, ResearchReply::class, 'publicationId'],
    ];

    public function comment(Request $request, string $type, string $slug): JsonResponse
    {
        abort_unless(isset(self::TYPES[$type]), 404);
        [$parentModel, $commentModel, , $foreignKey] = self::TYPES[$type];
        $input = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'comment' => ['required', 'string', 'max:4000'],
            'photo' => ['sometimes', 'string', 'max:1000'],
            'impression' => ['sometimes', 'string', 'max:1000'],
        ]);
        $saved = DB::transaction(function () use ($parentModel, $commentModel, $foreignKey, $slug, $input) {
            $parent = $parentModel::where('slug', $slug)->lockForUpdate()->firstOrFail();
            if (in_array($parentModel, [Article::class, ResearchPublication::class], true)) {
                abort_unless($parent->status === 'published', 404);
            }
            $allowed = (new $commentModel)->getFillable();
            return $commentModel::create(array_merge([
                $foreignKey => $parent->id,
                'sortOrder' => (int) $commentModel::where($foreignKey, $parent->id)->max('sortOrder') + 1,
            ], array_intersect_key($input, array_flip($allowed))));
        }, 3);
        return response()->json(['message' => 'Comment created.', 'comment' => $saved], 201);
    }

    public function reply(Request $request, string $type, string $slug, int $commentId): JsonResponse
    {
        abort_unless(isset(self::TYPES[$type]), 404);
        [$parentModel, $commentModel, $replyModel, $foreignKey] = self::TYPES[$type];
        $input = $request->validate([
            'name' => ['sometimes', 'string', 'max:191'],
            'reply' => ['required', 'string', 'max:4000'],
            'impression' => ['sometimes', 'string', 'max:1000'],
        ]);
        $saved = DB::transaction(function () use ($parentModel, $commentModel, $replyModel, $foreignKey, $slug, $commentId, $input) {
            $parent = $parentModel::where('slug', $slug)->lockForUpdate()->firstOrFail();
            $comment = $commentModel::where($foreignKey, $parent->id)->findOrFail($commentId);
            $allowed = (new $replyModel)->getFillable();
            return $replyModel::create(array_merge([
                'commentId' => $comment->id,
                'sortOrder' => (int) $replyModel::where('commentId', $comment->id)->max('sortOrder') + 1,
            ], array_intersect_key($input, array_flip($allowed))));
        }, 3);
        return response()->json(['message' => 'Reply created.', 'reply' => $saved], 201);
    }

    public function impression(string $type, string $slug): JsonResponse
    {
        abort_unless(isset(self::TYPES[$type]), 404);
        $model = self::TYPES[$type][0];
        return response()->json(['success' => $model::where('slug', $slug)->increment('impressionCount') > 0]);
    }

    public function articleShare(string $slug): JsonResponse
    {
        return response()->json(['success' => Article::where('slug', $slug)->where('status', 'published')->increment('shareCount') > 0]);
    }

    public function testimonial(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:191'], 'company' => ['required', 'string', 'max:191'],
            'position' => ['sometimes', 'string', 'max:191'], 'image' => ['sometimes', 'string', 'max:1000'],
            'content' => ['required', 'string', 'max:4000'], 'stars' => ['sometimes', 'integer', 'min:1', 'max:5'],
        ]);
        $data['content'] = nl2br(e($data['content']));
        $data['status'] = false;
        $data['sortOrder'] = (int) Testimonial::max('sortOrder') + 1;
        return response()->json(['message' => 'Review submitted for moderation.', 'testimonial' => Testimonial::create($data)], 201);
    }
}
