<?php

namespace App\Http\Controllers\Api;

use App\Models\CvProfile;
use App\Models\JobAgentAiSetting;
use App\Models\JobAgentEmailEvent;
use App\Models\JobAgentEmailSetting;
use App\Models\AiProvider;
use App\Models\AiSettings;
use App\Models\JobSource;
use App\Models\RecruiterContact;
use App\Models\Profile;
use App\Models\Project;
use App\Models\Skill;
use App\Models\Experience;
use App\Models\Education;
use App\Services\GmailJobAlertService;
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
            'profileContext' => [
                'profile' => Profile::find(1),
                'skills' => Skill::orderBy('sortOrder')->get(),
                'projects' => Project::orderBy('sortOrder')->get(),
                'experience' => Experience::orderBy('sortOrder')->get(),
                'education' => Education::orderBy('sortOrder')->get(),
                'cvProfiles' => CvProfile::orderByDesc('createdAt')->get(),
            ],
        ]);
    }

    public function overview(GmailJobAlertService $gmail): JsonResponse
    {
        $settings = JobAgentSettings::find(1);
        $emailSetting = JobAgentEmailSetting::find(1);
        $aiSetting = JobAgentAiSetting::find(1);
        $gmailState = $gmail->status();
        $mailEnabled = (bool) config('job_agent.allow_sending') && config('mail.default') === 'smtp';
        $smtpReady = $mailEnabled && (bool) config('mail.mailers.smtp.host')
            && (bool) config('mail.mailers.smtp.username') && (bool) config('mail.mailers.smtp.password');
        $aiProvider = strtolower((string) ($aiSetting?->aiProvider ?: AiSettings::find(1)?->activeProvider ?: 'openai'));
        $legacyProvider = AiProvider::where('name', $aiProvider)->first();
        $keyConfigured = match ($aiProvider) {
            'openai' => (bool) ($legacyProvider?->apiKey ?: config('services.portfolio_ai.api_key')),
            'deepseek' => (bool) ($legacyProvider?->apiKey ?: $aiSetting?->deepseekApiKeyEncrypted),
            'gemini' => (bool) ($legacyProvider?->apiKey ?: $aiSetting?->geminiApiKeyEncrypted),
            default => false,
        };
        $startOfDay = now()->startOfDay();
        $tracking = [
            'openTrackingEnabled' => (bool) $emailSetting?->openTrackingEnabled,
            'clickTrackingEnabled' => (bool) $emailSetting?->clickTrackingEnabled,
        ];
        $tracking['status'] = config('job_agent.tracking_enabled') &&
            ($tracking['openTrackingEnabled'] || $tracking['clickTrackingEnabled']) ? 'ACTIVE' : 'DISABLED';
        return response()->json(['overview' => [
            'totalJobs' => JobPost::count(),
            'matchedJobs' => JobMatch::count(),
            'drafts' => JobEmailDraft::whereIn('status', ['DRAFT', 'READY'])->count(),
            'sentEmails' => JobEmailDraft::whereIn('status', ['SENT', 'OPENED', 'CLICKED'])->count(),
            'openedEmails' => JobEmailDraft::where('openCount', '>', 0)->count(),
            'clickedEmails' => JobEmailDraft::where('clickCount', '>', 0)->count(),
            'failedEmails' => JobEmailDraft::where('status', 'FAILED')->count(),
            'boardJobs' => JobPost::whereIn('importMethod', ['API', 'RSS', 'PUBLIC_BOARD', 'COMPANY_CAREER_SITE'])->count(),
            'manualImports' => JobPost::where('importMethod', 'MANUAL')->count(),
            'jobsNeedingDescription' => JobPost::where('descriptionStatus', 'DESCRIPTION_REQUIRED')->count(),
            'autoDraftedJobs' => JobEmailDraft::where('aiProvider', '!=', '')->count(),
            'sentToday' => JobAgentEmailEvent::where('eventType', 'SENT')
                ->where('createdAt', '>=', $startOfDay)->count(),
            'dailySendLimit' => max(1, min(5, (int) ($settings?->dailySendLimit ?: 5))),
            'gmail' => [
                'oauthConfigured' => $gmailState['oauthConfigured'],
                'connected' => $gmailState['connected'],
                'email' => $gmailState['email'],
                'lastSyncTime' => $gmailState['lastSyncedAt'],
                'importedJobCount' => JobPost::where('sourceType', 'gmail')->count(),
                'status' => $gmailState['status'],
            ],
            'smtp' => [
                'isEnabled' => $mailEnabled,
                'fromEmail' => $emailSetting?->fromEmail ?: config('mail.from.address'),
                'smtpUsername' => config('mail.mailers.smtp.username'),
                'smtpHost' => config('mail.mailers.smtp.host'),
                'smtpPort' => config('mail.mailers.smtp.port'),
                'smtpSecure' => config('mail.mailers.smtp.scheme') === 'smtps',
                'passwordConfigured' => (bool) config('mail.mailers.smtp.password'),
                'dailySendLimit' => max(1, min(5, (int) ($settings?->dailySendLimit ?: 5))),
                'ready' => $smtpReady,
                'status' => $smtpReady ? 'READY' : ($mailEnabled ? 'CONFIG_REQUIRED' : 'DISABLED'),
            ],
            'ai' => [
                'aiProvider' => $aiProvider,
                'aiModel' => $aiSetting?->aiModel ?: config('services.portfolio_ai.model'),
                'activeProviderKeyConfigured' => $keyConfigured,
                'status' => $keyConfigured ? 'READY' : 'CONFIG_REQUIRED',
            ],
            'tracking' => $tracking + [
                'recentEvents' => JobAgentEmailEvent::orderByDesc('createdAt')->limit(6)->get(),
            ],
        ]]);
    }

    public function jobs(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'recentHours' => ['sometimes', 'integer', 'min:1', 'max:168'],
        ]);
        $page = (int) ($filters['page'] ?? 1);
        $limit = (int) ($filters['limit'] ?? 10);
        $hours = (int) ($filters['recentHours'] ?? 24);
        $jobs = JobPost::where('createdAt', '>=', now()->subHours($hours))
            ->orderByDesc('createdAt')->paginate($limit, ['*'], 'page', $page);
        $ids = collect($jobs->items())->pluck('id')->all();
        $matches = JobMatch::whereIn('jobPostId', $ids)->orderByDesc('createdAt')->get()->groupBy('jobPostId');
        $drafts = JobEmailDraft::whereIn('jobPostId', $ids)->orderByDesc('createdAt')->get()->groupBy('jobPostId');
        $contacts = RecruiterContact::whereIn('jobPostId', $ids)
            ->orderByDesc('confidenceScore')->get()->groupBy('jobPostId');

        return response()->json([
            'jobs' => collect($jobs->items())->map(function (JobPost $job) use ($matches, $drafts, $contacts) {
                return array_merge($job->toArray(), [
                    'matches' => ($matches->get($job->id) ?? collect())->take(1)->values(),
                    'emailDrafts' => ($drafts->get($job->id) ?? collect())->take(1)->values(),
                    'recruiterContacts' => ($contacts->get($job->id) ?? collect())->take(1)->values(),
                ]);
            })->values(),
            'pagination' => [
                'page' => $jobs->currentPage(), 'limit' => $limit,
                'total' => $jobs->total(), 'totalPages' => max(1, $jobs->lastPage()),
                'recentHours' => $hours,
            ],
        ]);
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
