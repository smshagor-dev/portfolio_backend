<?php

namespace App\Http\Controllers\Api;

use App\Models\Achievement;
use App\Models\Education;
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
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class BulkContentController extends Controller
{
    private const COLLECTIONS = [
        'skills' => Skill::class,
        'experiences' => Experience::class,
        'educations' => Education::class,
        'projects' => Project::class,
        'services' => Service::class,
        'statsCounters' => StatsCounter::class,
        'achievements' => Achievement::class,
        'pricings' => Pricing::class,
        'faqs' => Faq::class,
        'testimonials' => Testimonial::class,
    ];

    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'profile' => ['sometimes', 'array'],
            'siteSettings' => ['sometimes', 'array'],
            'serviceSection' => ['sometimes', 'array'],
            'replaceCollections' => ['sometimes', 'boolean'],
        ]);
        $body = $request->all();
        foreach (array_keys(self::COLLECTIONS) as $field) {
            if (array_key_exists($field, $body)) {
                validator($body, [
                    $field => ['required', 'array', 'max:300'],
                    $field.'.*' => ['required', 'array'],
                ])->validate();
            }
        }
        $counts = [];
        DB::transaction(function () use ($body, &$counts): void {
            foreach (['profile' => Profile::class, 'siteSettings' => SiteSettings::class, 'serviceSection' => ServiceSection::class] as $key => $model) {
                if (!array_key_exists($key, $body)) {
                    continue;
                }
                $entry = $model::firstOrNew(['id' => 1]);
                $allowed = array_diff($entry->getFillable(), ['id', 'smtpPass', 'smtpUser', 'smtpHost']);
                $data = array_intersect_key((array) $body[$key], array_flip($allowed));
                $entry->fill($data);
                $entry->save();
            }
            foreach (self::COLLECTIONS as $key => $model) {
                if (!array_key_exists($key, $body)) {
                    continue;
                }
                $ids = [];
                foreach ($body[$key] as $index => $value) {
                    $id = filter_var($value['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                    $entry = $id ? $model::find($id) : null;
                    $entry ??= new $model();
                    $allowed = array_diff($entry->getFillable(), [
                        'id', 'views', 'impressionCount', 'shareCount', 'createdAt', 'updatedAt',
                    ]);
                    $data = array_intersect_key($value, array_flip($allowed));
                    if (in_array('sortOrder', $allowed, true) && !isset($data['sortOrder'])) {
                        $data['sortOrder'] = $index + 1;
                    }
                    $entry->fill($data);
                    $entry->save();
                    $ids[] = $entry->id;
                }
                // Deletion is opt-in only; non-listed content is preserved by default.
                if (!empty($body['replaceCollections'])) {
                    $query = $model::query();
                    if ($ids) {
                        $query->whereNotIn('id', $ids);
                    }
                    $query->delete();
                }
                $counts[$key] = count($ids);
            }
        }, 3);
        return response()->json([
            'message' => 'Content updated successfully.',
            'data' => ['updated' => $counts],
            'nonDestructive' => empty($body['replaceCollections']),
        ]);
    }
}
