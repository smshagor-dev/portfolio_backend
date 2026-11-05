<?php

namespace App\Http\Controllers\Api;

use App\Models\JobBoardSource;
use App\Models\JobEmailDraft;
use App\Models\JobPost;
use App\Models\JobSource;
use App\Services\JobPublicContactService;
use App\Models\RecruiterContact;
use App\Services\JobSourceService;
use App\Services\CompanyCareerSourceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class JobCompatibilityController extends Controller
{
    public function seedSources(): JsonResponse
    {
        $presets = [
            ['sourceName' => 'Arbeitnow', 'sourceType' => 'PUBLIC_JOB_API',
                'baseUrl' => 'https://www.arbeitnow.com/api/job-board-api'],
            ['sourceName' => 'Remotive', 'sourceType' => 'PUBLIC_JOB_API',
                'baseUrl' => 'https://remotive.com/api/remote-jobs'],
            ['sourceName' => 'Remote OK', 'sourceType' => 'PUBLIC_JOB_API',
                'baseUrl' => 'https://remoteok.com/api'],
        ];
        $created = [];
        foreach ($presets as $source) {
            $created[] = JobBoardSource::firstOrCreate(
                ['baseUrl' => $source['baseUrl']],
                array_merge($source, [
                    'companyName' => '', 'region' => 'Global',
                    'careersUrl' => '', 'extractionStatus' => 'UNTESTED',
                    'extractionMessage' => 'Disabled until verified by an administrator.',
                    'enabled' => false, 'status' => 'Planned',
                ])
            );
        }
        return response()->json(['message' => 'Default sources prepared but disabled.', 'sources' => $created]);
    }

    public function syncSources(Request $request, JobSourceService $service): JsonResponse
    {
        $input = $request->validate([
            'sourceIds' => ['sometimes', 'array', 'max:10'],
            'sourceIds.*' => ['integer', 'min:1'],
        ]);
        $query = JobBoardSource::where('enabled', true);
        if (isset($input['sourceIds'])) {
            $query->whereIn('id', $input['sourceIds']);
        }
        $sources = $query->orderBy('id')->limit(10)->get();
        $stats = ['syncedSourceCount' => 0, 'importedCount' => 0, 'duplicateCount' => 0, 'errors' => []];
        foreach ($sources as $source) {
            try {
                $result = $service->sync($source);
                $stats['syncedSourceCount']++;
                $stats['importedCount'] += $result['importedCount'];
                $stats['duplicateCount'] += $result['duplicateCount'];
            } catch (\Throwable $exception) {
                report($exception);
                $stats['errors'][] = ['sourceId' => $source->id, 'message' => 'Sync failed; check server logs.'];
            }
        }
        return response()->json($stats);
    }

    public function companySources(): JsonResponse
    {
        return response()->json([
            'sources' => JobBoardSource::where('sourceType', 'COMPANY_CAREER_SITE')
                ->orderByDesc('updatedAt')->limit(200)->get(),
        ]);
    }

    public function addCompany(Request $request): JsonResponse
    {
        $input = $request->validate([
            'companyName' => ['required', 'string', 'max:191'],
            'careersUrl' => ['required', 'url:https', 'max:255'],
            'region' => ['sometimes', 'string', 'max:191'],
        ]);
        $adapter = CompanyCareerSourceService::recognize($input['careersUrl']);
        $source = JobBoardSource::create([
            'sourceName' => $input['companyName'],
            'companyName' => $input['companyName'],
            'region' => $input['region'] ?? '',
            'sourceType' => 'COMPANY_CAREER_SITE',
            'baseUrl' => $adapter['apiUrl'] ?? $input['careersUrl'],
            'careersUrl' => $input['careersUrl'],
            'detectedProvider' => $adapter['provider'] ?? 'UNSUPPORTED',
            'extractionStatus' => $adapter ? 'READY_TO_TEST' : 'UNSUPPORTED',
            'extractionMessage' => $adapter
                ? 'Supported public ATS. Administrator must enable source before import.'
                : 'No approved API adapter. URL saved without crawling.',
            'enabled' => false,
            'status' => 'Planned',
        ]);
        return response()->json([
            'message' => 'Company source saved disabled; inspect before enabling.',
            'source' => $source,
        ], 201);
    }

    public function updateCompany(Request $request, int $id): JsonResponse
    {
        $source = JobBoardSource::where('sourceType', 'COMPANY_CAREER_SITE')->findOrFail($id);
        $input = $request->validate([
            'companyName' => ['sometimes', 'string', 'max:191'],
            'careersUrl' => ['sometimes', 'url:https', 'max:255'],
            'region' => ['sometimes', 'string', 'max:191'],
            'notes' => ['sometimes', 'string', 'max:2000'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
        $url = $input['careersUrl'] ?? $source->careersUrl;
        $adapter = CompanyCareerSourceService::recognize($url);
        if (!empty($input['enabled']) && !$adapter) {
            return response()->json(['message' => 'This career site has no approved public API adapter.'], 422);
        }
        $source->fill(array_intersect_key($input, array_flip(['companyName','careersUrl','region','notes'])));
        $source->sourceName = $input['companyName'] ?? $source->sourceName;
        $source->baseUrl = $adapter['apiUrl'] ?? $url;
        $source->detectedProvider = $adapter['provider'] ?? 'UNSUPPORTED';
        $source->extractionStatus = $adapter ? 'READY_TO_TEST' : 'UNSUPPORTED';
        $source->enabled = (bool) ($input['enabled'] ?? false);
        $source->save();
        return response()->json(['source' => $source->fresh()]);
    }

    public function deleteCompany(int $id): JsonResponse
    {
        JobBoardSource::where('sourceType', 'COMPANY_CAREER_SITE')->findOrFail($id)->delete();
        return response()->json(['message' => 'Company source deleted.']);
    }

    public function testCompany(int $id, JobSourceService $service): JsonResponse
    {
        $source = JobBoardSource::where('sourceType', 'COMPANY_CAREER_SITE')->findOrFail($id);
        try {
            $probe = $service->probeCompany($source);
            $source->forceFill([
                'extractionStatus' => 'READY',
                'extractionMessage' => 'Public ATS API reachable; '.$probe['availableJobs'].' jobs found.',
                'status' => 'READY',
            ])->save();
            return response()->json([
                'message' => 'Company source tested.',
                'source' => $source->fresh(),
                'test' => $probe,
            ]);
        } catch (\InvalidArgumentException $error) {
            return response()->json([
                'message' => 'This company source has no approved public API adapter.',
                'supported' => false,
            ], 422);
        } catch (\Throwable $error) {
            report($error);
            $source->forceFill([
                'extractionStatus' => 'FAILED',
                'extractionMessage' => 'Public ATS API test failed; check server logs.',
                'status' => 'FAILED',
            ])->save();
            return response()->json(['message' => 'Company source API test failed.'], 502);
        }
    }

    public function importCompany(int $id, JobSourceService $service): JsonResponse
    {
        $source = JobBoardSource::where('sourceType', 'COMPANY_CAREER_SITE')->findOrFail($id);
        abort_unless($source->enabled, 409, 'Enable the verified source before import.');
        $adapter = CompanyCareerSourceService::recognize((string) $source->careersUrl);
        abort_unless($adapter && hash_equals($adapter['apiUrl'], (string) $source->baseUrl),
            422, 'Source API URL does not match the approved provider.');
        try {
            $result = $service->sync($source);
            return response()->json(['sourceId' => $source->id, 'result' => $result]);
        } catch (\Throwable $error) {
            report($error);
            return response()->json(['message' => 'Company source import failed. See server logs.'], 502);
        }
    }

    public function updateDescription(Request $request, int $id): JsonResponse
    {
        $job = JobPost::findOrFail($id);
        $input = $request->validate([
            'description' => ['required', 'string', 'min:15', 'max:100000'],
        ]);
        $job->forceFill([
            'description' => $input['description'],
            'descriptionStatus' => 'READY',
        ])->save();
        return response()->json(['job' => $job->fresh()]);
    }

    public function deleteJob(int $id): JsonResponse
    {
        JobPost::findOrFail($id)->delete();
        return response()->json(['message' => 'Job deleted.']);
    }

    public function rejectContact(Request $request, int $id): JsonResponse
    {
        $input = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);
        $contact = RecruiterContact::findOrFail($id);
        $contact->forceFill([
            'verified' => false, 'verification' => 'rejected_by_admin',
            'contactEmailStatus' => 'rejected',
            'validationStatus' => 'rejected',
            'errorMessage' => $input['reason'],
        ])->save();
        JobEmailDraft::where('recruiterContactId', $id)
            ->whereIn('status', ['DRAFT', 'READY'])
            ->update(['approvalStatus' => 'PENDING', 'status' => 'DRAFT']);
        return response()->json(['message' => 'Contact rejected and unsent drafts reset.', 'contact' => $contact]);
    }

    public function collectEmails(): JsonResponse
    {
        $drafts = JobEmailDraft::whereIn('status', ['DRAFT', 'READY'])
            ->whereNotNull('recruiterContactId')->limit(100)->get();
        $ready = 0;
        foreach ($drafts as $draft) {
            $contact = RecruiterContact::find($draft->recruiterContactId);
            if ($contact && $contact->verified
                && $contact->contactEmailStatus === 'approved'
                && filter_var($contact->email, FILTER_VALIDATE_EMAIL)) {
                $draft->forceFill(['toEmail' => $contact->email])->save();
                $ready++;
            }
        }
        return response()->json([
            'message' => 'Only previously verified contacts were attached; no unverified scraping occurred.',
            'collectedCount' => 0, 'emailReadyCount' => $ready, 'errors' => [],
        ]);
    }

    public function approveAll(Request $request): JsonResponse
    {
        $request->validate(['confirm' => ['required', 'accepted']]);
        $approved = DB::transaction(function () use ($request): int {
            $count = 0;
            $drafts = JobEmailDraft::whereIn('status', ['DRAFT', 'READY'])
                ->where('approvalStatus', '!=', 'APPROVED')
                ->orderBy('id')->limit(100)->lockForUpdate()->get();
            foreach ($drafts as $draft) {
                $contact = $draft->recruiterContactId
                    ? RecruiterContact::find($draft->recruiterContactId) : null;
                if (!$contact || !$contact->verified || $contact->contactEmailStatus !== 'approved'
                    || !filter_var($contact->email, FILTER_VALIDATE_EMAIL)
                    || strcasecmp($contact->email, $draft->toEmail) !== 0) {
                    continue;
                }
                $draft->forceFill([
                    'approvalStatus' => 'APPROVED', 'status' => 'READY',
                    'approvedAt' => now(), 'approvedBy' => (string) $request->user()->email,
                    'rejectedAt' => null, 'rejectionReason' => '',
                ])->save();
                $count++;
            }
            return $count;
        }, 3);
        return response()->json(['message' => 'Reviewed recipient-verified drafts approved.', 'approvedCount' => $approved]);
    }

    public function testEmail(Request $request): JsonResponse
    {
        if (!config('job_agent.allow_sending') || config('mail.default') !== 'smtp') {
            return response()->json(['message' => 'SMTP is disabled.'], 503);
        }
        Mail::raw(
            'This is a requested SMTP test from your Laravel portfolio backend.',
            fn ($message) => $message->to($request->user()->email)->subject('Portfolio backend SMTP test')
        );
        return response()->json(['message' => 'SMTP test passed to the mail transport; inbox delivery is not guaranteed.']);
    }

    public function discoverContacts(int $id, JobPublicContactService $service): JsonResponse
    {
        $job = JobPost::findOrFail($id);
        $result = $service->discover($job);
        return response()->json(array_merge([
            'message' => $result['contacts']
                ? 'Found public company contacts; manual recipient approval is required.'
                : 'No validated public company contact found.',
        ], $result));
    }

    public function revalidateContact(int $id, JobPublicContactService $service): JsonResponse
    {
        $contact = RecruiterContact::findOrFail($id);
        $job = JobPost::findOrFail($contact->jobPostId);
        $result = $service->evaluate((string) $contact->email, $job);
        if (!$result['accepted']) {
            // Do not retain sending permission for a now-invalid recipient.
            $contact->verified = false;
            $contact->contactEmailStatus = 'rejected';
            JobEmailDraft::where('recruiterContactId', $contact->id)
                ->whereIn('status', ['DRAFT', 'READY'])
                ->update(['approvalStatus' => 'PENDING', 'status' => 'DRAFT']);
        }
        $contact->forceFill([
            'validationStatus' => $result['accepted'] ? 'valid' : 'rejected',
            'confidenceScore' => $result['confidenceScore'],
            'errorMessage' => $result['accepted'] ? '' : implode('; ', $result['reasons']),
            'lastVerifiedAt' => now(),
        ])->save();
        return response()->json(['message' => 'Contact revalidated.', 'contact' => $contact->fresh()]);
    }

    public function apiPlaceholder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:191'],
            'provider' => ['sometimes', 'string', 'max:191'],
            'baseUrl' => ['nullable', 'url:https', 'max:255'],
            'notes' => ['sometimes', 'string', 'max:2000'],
        ]);
        // This only records the integration request; it NEVER fetches the
        // supplied URL or enables unreviewed provider network access.
        $source = JobSource::create([
            'name' => $data['name'] ?? 'Approved public job API',
            'type' => 'api_placeholder',
            'provider' => $data['provider'] ?? 'public-approved',
            'status' => 'placeholder',
            'config' => [
                'baseUrl' => $data['baseUrl'] ?? '',
                'notes' => $data['notes'] ?? 'Review provider API terms before integration.',
            ],
        ]);
        return response()->json(['message' => 'API source placeholder saved.', 'source' => $source], 201);
    }

    public function notYetSupported(): JsonResponse
    {
        return response()->json([
            'message' => 'This integration is not available in Laravel yet; no external actions were attempted.',
        ], 501);
    }
}
