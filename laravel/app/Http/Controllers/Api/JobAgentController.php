<?php

namespace App\Http\Controllers\Api;

use App\Models\CvProfile;
use App\Models\JobAgentSettings;
use App\Models\JobBoardSource;
use App\Models\JobEmailDraft;
use App\Models\JobMatch;
use App\Models\JobPost;
use App\Models\JobSearchPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class JobAgentController extends Controller
{
    private function settings(): array
    {
        $settings = JobAgentSettings::find(1)?->toArray() ?? [];
        unset($settings['gmailRefreshToken']);
        return array_merge($settings, ['autoSendEnabled' => false]);
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'settings' => $this->settings(),
            'jobs' => JobPost::orderByDesc('createdAt')->limit(50)->get(),
            'cvProfiles' => CvProfile::orderByDesc('createdAt')->get(),
            'profileContext' => null,
            'migration' => ['sourceIngestion' => 'pending', 'emailSending' => 'disabled'],
        ]);
    }

    public function overview(): JsonResponse
    {
        return response()->json(['overview' => [
            'totalJobs' => JobPost::count(),
            'matchedJobs' => JobMatch::count(),
            'drafts' => JobEmailDraft::whereIn('status', ['DRAFT', 'READY'])->count(),
            'sentEmails' => JobEmailDraft::whereIn('status', ['SENT', 'OPENED', 'CLICKED'])->count(),
            'openedEmails' => JobEmailDraft::where('openCount', '>', 0)->count(),
            'clickedEmails' => JobEmailDraft::where('clickCount', '>', 0)->count(),
            'failedEmails' => JobEmailDraft::where('status', 'FAILED')->count(),
            'jobsNeedingDescription' => JobPost::where('descriptionStatus', 'DESCRIPTION_REQUIRED')->count(),
            'gmail' => ['connected' => false, 'status' => 'NOT_MIGRATED'],
            'smtp' => ['ready' => false, 'status' => 'DISABLED'],
            'ai' => ['status' => 'NOT_MIGRATED'],
            'tracking' => ['status' => 'DISABLED'],
        ]]);
    }

    public function jobs(): JsonResponse
    {
        return response()->json(['jobs' => JobPost::orderByDesc('createdAt')->limit(200)->get()]);
    }

    public function job(int $id): JsonResponse
    {
        return response()->json(['job' => JobPost::findOrFail($id)]);
    }

    public function matches(): JsonResponse
    {
        return response()->json(['matches' => JobMatch::orderByDesc('createdAt')->limit(200)->get()]);
    }

    public function drafts(): JsonResponse
    {
        return response()->json(['drafts' => JobEmailDraft::orderByDesc('createdAt')->limit(200)->get()]);
    }

    public function sources(): JsonResponse
    {
        return response()->json(['sources' => JobBoardSource::orderBy('sourceName')->get()]);
    }

    public function preferences(): JsonResponse
    {
        return response()->json(['preferences' => JobSearchPreference::find(1)]);
    }

    public function manualJob(Request $request): JsonResponse
    {
        $input = $request->validate([
            'title' => ['required', 'string', 'max:191'],
            'company' => ['required', 'string', 'max:191'],
            'location' => ['sometimes', 'string', 'max:191'],
            'sourceUrl' => ['required', 'url:http,https', 'max:255'],
            'applyUrl' => ['sometimes', 'url:http,https', 'max:255'],
            'companyUrl' => ['sometimes', 'url:http,https', 'max:255'],
            'description' => ['required', 'string', 'max:100000'],
            'jobType' => ['sometimes', 'string', 'max:191'],
            'workMode' => ['sometimes', 'string', 'max:191'],
            'region' => ['sometimes', 'string', 'max:191'],
        ]);
        $existing = JobPost::where('sourceUrl', $input['sourceUrl'])->first();
        if ($existing) {
            return response()->json(['message' => 'Job already imported.', 'job' => $existing], 409);
        }
        $record = JobPost::create(array_merge([
            'sourceType' => 'manual', 'externalId' => null,
            'sourceUrl' => $input['sourceUrl'],
            'applyUrl' => $input['applyUrl'] ?? $input['sourceUrl'],
            'companyUrl' => $input['companyUrl'] ?? '',
            'rawContent' => $input['description'], 'importMethod' => 'MANUAL',
            'sourceName' => 'Manual Import', 'status' => 'new',
        ], $input));
        return response()->json(['message' => 'Job imported.', 'job' => $record], 201);
    }

    public function createDraft(Request $request, int $id): JsonResponse
    {
        $job = JobPost::findOrFail($id);
        $input = $request->validate([
            'recruiterContactId' => ['required', 'integer', 'exists:recruiter_contacts,id'],
            'toEmail' => ['required', 'email', 'max:191'],
            'subject' => ['required', 'string', 'max:191'],
            'body' => ['required', 'string', 'max:20000'],
            'coverLetterText' => ['sometimes', 'string', 'max:20000'],
        ]);
        $contact = \App\Models\RecruiterContact::where('jobPostId', $job->id)
            ->where('verified', true)->where('contactEmailStatus', 'approved')
            ->findOrFail($input['recruiterContactId']);
        abort_unless(strcasecmp($contact->email, $input['toEmail']) === 0, 422, 'Recipient mismatch.');
        $draft = JobEmailDraft::create(array_merge([
            'jobPostId' => $job->id,
            'trackingId' => (string) Str::uuid(),
            'adminApprovalRequired' => true,
            'approvalStatus' => 'PENDING',
            'status' => 'DRAFT',
            'sendStatus' => 'pending',
        ], $input));
        return response()->json(['message' => 'Draft created for admin approval.', 'draft' => $draft], 201);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $draft = DB::transaction(function () use ($id, $request) {
            $draft = JobEmailDraft::lockForUpdate()->findOrFail($id);
            abort_if(in_array($draft->status, ['SENT', 'OPENED', 'CLICKED', 'SENDING'], true), 409);
            $contact = $draft->recruiterContactId
                ? \App\Models\RecruiterContact::where('jobPostId', $draft->jobPostId)->find($draft->recruiterContactId)
                : null;
            abort_unless($contact && $contact->verified && $contact->contactEmailStatus === 'approved'
                && strcasecmp((string) $contact->email, (string) $draft->toEmail) === 0, 422,
                'A verified recipient is required before approval.');
            $draft->update([
                'approvalStatus' => 'APPROVED',
                'approvedAt' => now(),
                'approvedBy' => (string) $request->user()->email,
                'status' => 'READY',
            ]);
            return $draft;
        });
        return response()->json(['message' => 'Draft approved. Sending remains disabled until the mail migration is validated.', 'draft' => $draft]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);
        $draft = DB::transaction(function () use ($id, $data) {
            $draft = JobEmailDraft::lockForUpdate()->findOrFail($id);
            abort_if(in_array($draft->status, ['SENT', 'OPENED', 'CLICKED'], true), 409);
            $draft->update([
                'approvalStatus' => 'REJECTED', 'status' => 'REJECTED',
                'rejectedAt' => now(), 'rejectionReason' => $data['reason'],
            ]);
            return $draft;
        });
        return response()->json(['message' => 'Draft rejected.', 'draft' => $draft]);
    }

    public function sendingUnavailable(): JsonResponse
    {
        return response()->json([
            'message' => 'Email sending is disabled until Laravel Gmail/SMTP integration and safety tests are completed.',
        ], 501);
    }
}
