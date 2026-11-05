<?php

namespace App\Http\Controllers\Api;

use App\Models\Achievement;
use App\Models\Article;
use App\Models\Education;
use App\Models\EmergencyContact;
use App\Models\Experience;
use App\Models\Faq;
use App\Models\Pricing;
use App\Models\Profile;
use App\Models\Project;
use App\Models\Service;
use App\Models\ServiceSection;
use App\Models\SiteSettings;
use App\Models\Skill;
use App\Models\StatsCounter;
use App\Models\Testimonial;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Routing\Controller;

class PublicSiteController extends Controller
{
    private function profile(): ?Profile
    {
        return Profile::find(1);
    }

    private function settings(): array
    {
        $settings = SiteSettings::find(1)?->toArray() ?? [];
        // The public settings response must never expose mail or other credentials.
        return array_diff_key($settings, array_flip([
            'smtpPass', 'smtpUser', 'smtpHost', 'smtpFromEmail', 'smtpReplyToEmail',
            'smtpToEmail', 'smtpPort', 'smtpSecure',
        ]));
    }

    public function settingsJson(): JsonResponse
    {
        return response()->json($this->settings());
    }

    public function home(): JsonResponse
    {
        $profile = $this->profile();
        if (!$profile) {
            return response()->json(['message' => 'Profile not found.'], 404);
        }
        $services = Service::where('status', true)->withCount('comments')
            ->orderByDesc('isFeatured')->orderBy('sortOrder')->get()
            ->map(fn ($s) => array_merge($s->only([
                'id', 'slug', 'name', 'impressionCount', 'description', 'isFeatured',
                'icon', 'views', 'sortOrder',
            ]), ['commentCount' => $s->comments_count]));
        $articles = Article::where('status', 'published')->where(function ($q) {
            $q->whereNull('publishDate')->orWhere('publishDate', '<=', now());
        })->withCount('comments')->orderByDesc('publishDate')->limit(6)->get()
            ->map(fn ($a) => array_merge($a->only([
                'id', 'title', 'slug', 'shortDescription', 'category',
                'featuredImage', 'author', 'publishDate', 'views', 'impressionCount', 'shareCount',
            ]), ['commentCount' => $a->comments_count, 'replyCount' => 0, 'categories' => []]));
        return response()->json([
            'profile' => $profile,
            'siteSettings' => $this->settings(),
            'serviceSection' => ServiceSection::find(1),
            'services' => $services,
            'statsCounters' => StatsCounter::orderBy('sortOrder')->get(),
            'achievements' => Achievement::orderBy('sortOrder')->get(),
            'skills' => Skill::orderBy('sortOrder')->get(),
            'experiences' => Experience::orderBy('sortOrder')->get(),
            'projects' => Project::orderBy('sortOrder')->get(),
            'educations' => Education::orderBy('sortOrder')->get(),
            'pricings' => Pricing::where('status', true)->orderByDesc('isPopular')->orderBy('sortOrder')->get(),
            'faqs' => Faq::where('status', true)->orderBy('sortOrder')->get(),
            'testimonials' => Testimonial::where('status', true)->orderBy('sortOrder')->get(),
            'blogs' => $this->blogFeed($profile->devUsername),
            'articles' => $articles,
            'emergencyContacts' => EmergencyContact::orderBy('sortOrder')->get(),
        ]);
    }

    public function pricings(): JsonResponse
    {
        return response()->json([
            'profile' => $this->profile(),
            'siteSettings' => $this->settings(),
            'pricings' => Pricing::where('status', true)->orderByDesc('isPopular')->orderBy('sortOrder')->get(),
        ]);
    }

    public function pricing(string $slug): JsonResponse
    {
        $pricing = Pricing::where('slug', $slug)->where('status', true)->first();
        if (!$pricing) {
            return response()->json(['message' => 'Pricing plan not found.'], 404);
        }
        return response()->json([
            'profile' => $this->profile(),
            'siteSettings' => $this->settings(),
            'pricing' => $pricing,
            'relatedPricings' => Pricing::where('status', true)->where('slug', '!=', $slug)->limit(3)->get(),
        ]);
    }

    public function project(string $slug): JsonResponse
    {
        $project = Project::where('slug', $slug)->with('comments.replies')->first();
        if (!$project) {
            return response()->json(['message' => 'Project not found.'], 404);
        }
        $project->increment('views');
        return response()->json([
            'profile' => $this->profile(),
            'siteSettings' => $this->settings(),
            'project' => $project->fresh()->load('comments.replies'),
            'relatedProjects' => Project::where('slug', '!=', $slug)->orderBy('sortOrder')->limit(5)->get(),
        ]);
    }

    public function services(): JsonResponse
    {
        return response()->json([
            'profile' => $this->profile(),
            'siteSettings' => $this->settings(),
            'serviceSection' => ServiceSection::find(1),
            'services' => Service::where('status', true)->with('comments.replies')
                ->orderByDesc('isFeatured')->orderBy('sortOrder')->get(),
        ]);
    }

    public function service(string $slug): JsonResponse
    {
        $service = Service::where('slug', $slug)->where('status', true)->with('comments.replies')->first();
        if (!$service) {
            return response()->json(['message' => 'Service not found.'], 404);
        }
        $service->increment('views');
        return response()->json([
            'profile' => $this->profile(),
            'siteSettings' => $this->settings(),
            'serviceSection' => ServiceSection::find(1),
            'service' => $service->fresh()->load('comments.replies'),
            'relatedServices' => Service::where('status', true)->where('slug', '!=', $slug)->limit(3)->get(),
        ]);
    }

    public function articles(): JsonResponse
    {
        return response()->json(Article::where('status', 'published')
            ->where(fn ($q) => $q->whereNull('publishDate')->orWhere('publishDate', '<=', now()))
            ->with('comments.replies')->orderByDesc('publishDate')->get());
    }

    public function article(string $slug): JsonResponse
    {
        $article = Article::where('slug', $slug)->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('publishDate')->orWhere('publishDate', '<=', now()))
            ->with('comments.replies')->first();
        if (!$article) {
            return response()->json(['message' => 'Article not found.'], 404);
        }
        $article->increment('views');
        return response()->json([
            'profile' => $this->profile(),
            'siteSettings' => $this->settings(),
            'article' => $article->fresh()->load('comments.replies'),
            'relatedArticles' => Article::where('status', 'published')->where('slug', '!=', $slug)
                ->orderByDesc('publishDate')->limit(5)->get(),
        ]);
    }

    private function blogFeed(?string $username): array
    {
        $username = trim((string) $username);
        if (!$username || !preg_match('/^[a-zA-Z0-9_-]{1,60}$/D', $username)) {
            return [];
        }
        return Cache::remember('devto:articles:'.sha1(strtolower($username)), now()->addMinutes(15), function () use ($username): array {
            try {
                $response = Http::timeout(4)->withoutRedirecting()->acceptJson()
                    ->get('https://dev.to/api/articles', ['username' => $username, 'per_page' => 50]);
                if (!$response->successful()) {
                    return [];
                }
                $articles = $response->json();
                return is_array($articles)
                    ? array_values(array_filter($articles, fn ($item) => is_array($item) && !empty($item['cover_image'])))
                    : [];
            } catch (\Throwable $error) {
                report($error);
                return [];
            }
        });
    }

    public function blogs(): JsonResponse
    {
        return response()->json($this->blogFeed($this->profile()?->devUsername));
    }
}
