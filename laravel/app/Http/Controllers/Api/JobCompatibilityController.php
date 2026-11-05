<?php

namespace App\Http\Controllers\Api;

use App\Models\JobBoardSource;
use App\Models\JobEmailDraft;
use App\Models\JobPost;
use App\Models\RecruiterContact;
use App\Services\JobSourceService;
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
        $source = JobBoardSource::create([
            'sourceName' => $input['companyName'], 'companyName' => $input['companyName'],
            'region' => $input['region'] ?? '',
            'sourceType' => 'COMPANY_CAREER_SITE',
            'baseUrl' => $input['careersUrl'], 'careersUrl' => $input['careersUrl'],
            'detectedProvider' => 'UNTESTED', 'extractionStatus' => 'UNSUPPORTED',
            'extractionMessage' => 'Company adapter not yet implemented. URL stored without crawling.',
            'enabled' => false, 'status' => 'Planned',
        ]);
        return response()->json([
            'message' => 'Company source saved, but not enabled for crawling.', 'source' => $source,
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
        ]);
        $source->fill($input);
        if (isset($input['companyName'])) {
            $source->sourceName = $input['companyName'];
        }
        if (isset($input['careersUrl'])) {
            $source->baseUrl = $input['careersUrl'];
        }
        $source->enabled = false;
        $source->save();
        return response()->json(['source' => $source->fresh()]);
    }

    public function deleteCompany(int $id): JsonResponse
    {
        JobBoardSource::where('sourceType', 'COMPANY_CAREER_SITE')->findOrFail($id)->delete();
        return response()->json(['message' => 'Company source deleted.']);
    }

    public function unsupportedCompany(int $id): JsonResponse
    {
        JobBoardSource::where('sourceType', 'COMPANY_CAREER_SITE')->findOrFail($id);
        return response()->json([
            'supported' => false,
            'message' => 'No verified adapter for this career site; import was not attempted.',
        ], 501);
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

    public function notYetSupported(): JsonResponse
    {
        return response()->json([
            'message' => 'This integration is not available in Laravel yet; no external actions were attempted.',
        ], 501);
    }
}
