<?php

namespace App\Http\Controllers\Api;

use App\Models\SiteSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class FounderProjectsController extends Controller
{
    private const MAX_PROJECTS = 30;

    private function settings(): SiteSettings
    {
        // Do not create an incomplete SiteSettings document: other APIs expect
        // the existing Prisma-backed record with its required fields.
        $settings = SiteSettings::find(1);
        abort_unless($settings, 503, 'Site settings are not initialized.');
        return $settings;
    }

    private function records(SiteSettings $settings): ?array
    {
        $value = $settings->founderProjects;
        return is_array($value) ? array_values($value) : null;
    }

    private function sorted(array $records): array
    {
        usort($records, fn (array $a, array $b) =>
            ((int) ($a['sortOrder'] ?? 0) <=> (int) ($b['sortOrder'] ?? 0))
            ?: strcmp((string) ($a['slug'] ?? ''), (string) ($b['slug'] ?? '')));
        return array_values($records);
    }

    public function publicIndex(): JsonResponse
    {
        $records = $this->records($this->settings());
        $data = $records === null ? [] : array_values(array_filter(
            $records,
            fn ($record) => is_array($record) && ($record['status'] ?? true) !== false
        ));
        return response()->json([
            'success' => true, 'initialized' => $records !== null,
            'data' => $this->sorted($data),
        ]);
    }

    public function adminIndex(): JsonResponse
    {
        $records = $this->records($this->settings());
        return response()->json([
            'success' => true, 'initialized' => $records !== null,
            'data' => $this->sorted($records ?? []),
        ]);
    }

    private function text(mixed $value, int $max = 10000): string
    {
        return mb_substr(trim(is_string($value) ? $value : ''), 0, $max);
    }

    private function strings(mixed $value, int $limit = 60): array
    {
        return array_values(array_map(
            fn ($item) => $this->text($item, 10000),
            array_filter(array_slice(is_array($value) ? $value : [], 0, $limit), 'is_string')
        ));
    }

    private function objects(mixed $value, array $keys, int $limit = 30): array
    {
        $result = [];
        foreach (array_slice(is_array($value) ? $value : [], 0, $limit) as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $item = [];
            foreach ($keys as $key) {
                $item[$key] = $this->text($entry[$key] ?? null);
            }
            $result[] = $item;
        }
        return $result;
    }

    private function validateProject(array $input): array
    {
        $rules = [
            'slug' => ['required', 'string', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', 'max:120'],
            'name' => ['required', 'string', 'max:160'],
            'image' => ['required', 'string', 'max:2000'],
            'imageAlt' => ['nullable', 'string', 'max:500'],
            'website' => ['nullable', 'string', 'max:2000'],
            'repository' => ['nullable', 'string', 'max:2000'],
            'status' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'imageWidth' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'imageHeight' => ['sometimes', 'integer', 'min:1', 'max:10000'],
        ];
        foreach (['eyebrow','tagline','summary','imageNote','overview','journeyIntro','outcome'] as $field) {
            $rules[$field] = ['nullable', 'string', 'max:20000'];
        }
        foreach (['role','focus','context','responsibilities','delivered','ongoing','stack'] as $field) {
            $rules[$field] = ['sometimes', 'array', 'max:60'];
            $rules[$field.'.*'] = ['string', 'max:10000'];
        }
        foreach (['principles','journey','decisions'] as $field) {
            $rules[$field] = ['sometimes', 'array', 'max:30'];
            $rules[$field.'.*'] = ['array'];
        }

        Validator::make($input, $rules)->after(function ($validator) use ($input) {
            foreach (['image','website','repository'] as $key) {
                $url = trim((string) ($input[$key] ?? ''));
                if ($url === '') {
                    continue;
                }
                $allowedPath = $key === 'image' && preg_match('~^/(?:uploads|founder)/[a-zA-Z0-9_./-]+$~D', $url)
                    && !str_contains($url, '..');
                if (!$allowedPath && !filter_var($url, FILTER_VALIDATE_URL)) {
                    $validator->errors()->add($key, 'Enter a valid HTTPS URL or an allowed local image path.');
                    continue;
                }
                if (!$allowedPath && (!str_starts_with(strtolower($url), 'https://')
                    || parse_url($url, PHP_URL_USER) !== null
                    || parse_url($url, PHP_URL_PASS) !== null)) {
                    $validator->errors()->add($key, 'Only HTTPS external URLs are allowed.');
                }
            }
        })->validate();

        $project = [];
        foreach (['slug','name','eyebrow','tagline','summary','website','repository',
            'image','imageAlt','imageNote','overview','journeyIntro','outcome'] as $key) {
            $project[$key] = $this->text($input[$key] ?? null, $key === 'slug' ? 120 : 20000);
        }
        foreach (['role','focus','context','responsibilities','delivered','ongoing','stack'] as $key) {
            $project[$key] = $this->strings($input[$key] ?? []);
        }
        $project['principles'] = $this->objects($input['principles'] ?? [], ['title', 'description']);
        $project['journey'] = $this->objects($input['journey'] ?? [],
            ['step', 'title', 'status', 'lead', 'result']);
        // Journey details are an array of paragraphs; preserve as strings.
        foreach ($project['journey'] as $index => &$stage) {
            $stage['details'] = $this->strings($input['journey'][$index]['details'] ?? []);
        }
        unset($stage);
        $project['decisions'] = $this->objects($input['decisions'] ?? [],
            ['title', 'situation', 'approach', 'tradeoff']);
        $project['status'] = (bool) ($input['status'] ?? true);
        $project['sortOrder'] = (int) ($input['sortOrder'] ?? 0);
        $project['imageWidth'] = (int) ($input['imageWidth'] ?? 1200);
        $project['imageHeight'] = (int) ($input['imageHeight'] ?? 645);
        return $project;
    }

    private function save(SiteSettings $settings, array $records): array
    {
        $records = $this->sorted($records);
        $settings->forceFill(['founderProjects' => $records])->save();
        return $records;
    }

    public function replace(Request $request): JsonResponse
    {
        $input = $request->validate(['projects' => ['present', 'array', 'max:'.self::MAX_PROJECTS]]);
        $projects = [];
        $slugs = [];
        foreach ($input['projects'] as $entry) {
            if (!is_array($entry)) {
                throw ValidationException::withMessages(['projects' => 'All projects must be objects.']);
            }
            $project = $this->validateProject($entry);
            if (isset($slugs[$project['slug']])) {
                throw ValidationException::withMessages(['projects' => 'Project slugs must be unique.']);
            }
            $slugs[$project['slug']] = true;
            $projects[] = $project;
        }
        return response()->json(['success' => true, 'message' => 'Founder projects saved.',
            'initialized' => true, 'data' => $this->save($this->settings(), $projects)]);
    }

    public function store(Request $request): JsonResponse
    {
        $project = $this->validateProject($request->all());
        $settings = $this->settings();
        $projects = $this->records($settings) ?? [];
        abort_if(count($projects) >= self::MAX_PROJECTS, 422, 'Founder project limit reached.');
        foreach ($projects as $item) {
            abort_if(($item['slug'] ?? '') === $project['slug'], 409, 'Project slug already exists.');
        }
        $projects[] = $project;
        $this->save($settings, $projects);
        return response()->json(['success' => true, 'message' => 'Founder project created.', 'data' => $project], 201);
    }

    public function update(Request $request, string $slug): JsonResponse
    {
        $settings = $this->settings();
        $projects = $this->records($settings) ?? [];
        $found = false;
        $project = $this->validateProject($request->all());
        foreach ($projects as $index => $item) {
            if (($item['slug'] ?? '') === $slug) {
                $projects[$index] = $project;
                $found = true;
            } elseif (($item['slug'] ?? '') === $project['slug']) {
                abort(409, 'Project slug already exists.');
            }
        }
        abort_unless($found, 404, 'Founder project not found.');
        $this->save($settings, $projects);
        return response()->json(['success' => true, 'message' => 'Founder project updated.', 'data' => $project]);
    }

    public function destroy(string $slug): JsonResponse
    {
        $settings = $this->settings();
        $projects = $this->records($settings) ?? [];
        $remaining = array_values(array_filter($projects,
            fn ($item) => ($item['slug'] ?? '') !== $slug));
        abort_if(count($remaining) === count($projects), 404, 'Founder project not found.');
        $this->save($settings, $remaining);
        return response()->json(['success' => true, 'message' => 'Founder project deleted.']);
    }
}
