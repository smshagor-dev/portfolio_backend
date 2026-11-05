<?php

namespace App\Http\Controllers\Api;

use App\Models\JobBoardSource;
use App\Models\JobEmailDraft;
use App\Models\JobAgentEmailEvent;
use App\Models\JobAgentSettings;
use App\Models\JobAgentEmailSetting;
use App\Services\LegacyCredentialCodec;
use App\Models\RecruiterContact;
use App\Services\JobSourceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use App\Models\CvProfile;

class JobIntegrationController extends Controller
{
    public function addSource(Request $request): JsonResponse
    {
        $input = $request->validate([
            'sourceName' => ['required', 'string', 'max:191'],
            'region' => ['required', 'string', 'max:191'],
            'sourceType' => ['required', 'string', 'max:191'],
            'baseUrl' => ['required', 'url:https', 'max:255'],
            'companyName' => ['sometimes', 'string', 'max:191'],
        ]);
        $source = JobBoardSource::create(array_merge([
            'careersUrl' => '', 'extractionMessage' => '', 'enabled' => false,
            'status' => 'Ready', 'detectedProvider' => 'API',
        ], $input));
        return response()->json(['source' => $source, 'message' => 'Source created disabled. Enable only after verification.'], 201);
    }

    public function updateSource(Request $request, int $id): JsonResponse
    {
        $input = $request->validate([
            'enabled' => ['sometimes', 'boolean'], 'baseUrl' => ['sometimes', 'url:https', 'max:255'],
            'sourceName' => ['sometimes', 'string', 'max:191'], 'region' => ['sometimes', 'string', 'max:191'],
            'companyName' => ['sometimes', 'string', 'max:191'],
        ]);
        $source = JobBoardSource::findOrFail($id);
        $source->update($input);
        return response()->json(['source' => $source->fresh()]);
    }

    public function syncSource(int $id, JobSourceService $service): JsonResponse
    {
        $source = JobBoardSource::findOrFail($id);
        try {
            return response()->json(['data' => $service->sync($source)]);
        } catch (\Throwable $error) {
            report($error);
            return response()->json(['message' => 'Source sync failed. Check source configuration and server logs.'], 422);
        }
    }

    public function addContact(Request $request): JsonResponse
    {
        $input = $request->validate([
            'jobPostId' => ['required', 'integer', 'exists:job_posts,id'],
            'name' => ['sometimes', 'string', 'max:191'],
            'email' => ['required', 'email', 'max:191'],
            'companyDomain' => ['required', 'string', 'max:191'],
            'sourceUrl' => ['required', 'url:https', 'max:255'],
        ]);
        $contact = RecruiterContact::create(array_merge([
            'companyName' => '', 'source' => 'manual',
            'verification' => 'manual', 'verified' => false,
            'validationStatus' => 'pending', 'contactEmailStatus' => 'pending',
        ], $input));
        return response()->json(['contact' => $contact, 'message' => 'Manual verification required before sending.'], 201);
    }

    public function approveContact(Request $request, int $id): JsonResponse
    {
        $contact = RecruiterContact::findOrFail($id);
        $request->validate(['confirm' => ['required', 'accepted']]);
        $contact->forceFill([
            'verified' => true, 'lastVerifiedAt' => now(),
            'verification' => 'admin_manually_verified',
            'validationStatus' => 'valid', 'contactEmailStatus' => 'approved',
        ])->save();
        return response()->json(['contact' => $contact->fresh()]);
    }

    public function send(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'attachCv' => ['sometimes', 'boolean'],
            'attachCoverLetter' => ['sometimes', 'boolean'],
        ]);
        $wantsCv = $request->boolean('attachCv');
        $wantsLetter = $request->boolean('attachCoverLetter');
        if (($wantsCv || $wantsLetter) && !config('job_agent.allow_attachments')) {
            return response()->json(['message' => 'Attachments are disabled by server configuration.'], 422);
        }
        if (!config('job_agent.allow_sending')) {
            return response()->json(['message' => 'SMTP sending disabled by server configuration.'], 503);
        }
        $smtpSettings = JobAgentEmailSetting::find(1);
        if ($smtpSettings && !$smtpSettings->isEnabled) {
            return response()->json(['message' => 'SMTP sending disabled in Job Agent settings.'], 503);
        }
        try {
            $password = $smtpSettings?->smtpPasswordEncrypted
                ? LegacyCredentialCodec::storedSecret($smtpSettings, 'smtpPasswordEncrypted')
                : (string) config('mail.mailers.smtp.password');
        } catch (\Throwable $error) {
            report($error);
            return response()->json(['message' => 'Stored SMTP credential requires migration configuration.'], 503);
        }
        $host = (string) ($smtpSettings?->smtpHost ?: config('mail.mailers.smtp.host'));
        $username = (string) ($smtpSettings?->smtpUsername ?: config('mail.mailers.smtp.username'));
        if (!$host || !$username || !$password) {
            return response()->json(['message' => 'SMTP host, username and password are required.'], 503);
        }
        $smtpPort = (int) ($smtpSettings?->smtpPort ?: config('mail.mailers.smtp.port') ?: 587);
        config()->set('mail.mailers.job_agent_smtp', [
            'transport' => 'smtp',
            'scheme' => ($smtpSettings?->smtpSecure ?? true) ? 'smtps' : 'smtp',
            'host' => $host,
            'port' => $smtpPort,
            'username' => $username,
            'password' => $password,
            'timeout' => 15,
        ]);
        $fromEmail = (string) ($smtpSettings?->fromEmail ?: config('mail.from.address'));
        $fromName = (string) ($smtpSettings?->fromName ?: config('mail.from.name'));

        // Attach only explicitly requested files from private, known folders.
        // Check paths and size before reserving a daily send slot.
        $attachments = [];
        if ($wantsCv || $wantsLetter) {
            $preview = JobEmailDraft::findOrFail($id);
            $sources = [];
            if ($wantsCv) {
                $sources['CV'] = (string) ($preview->cvUrl ?: CvProfile::where('isDefault', true)->value('resumeUrl'));
            }
            if ($wantsLetter) {
                $sources['Cover letter'] = (string) $preview->coverLetterPdfUrl;
            }
            foreach ($sources as $label => $path) {
                $folder = $label === 'CV' ? 'job-cv/' : 'job-cover-letters/';
                $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
                $allowed = $label === 'CV' ? ['pdf', 'doc', 'docx'] : ['pdf'];
                if (!str_starts_with($path, $folder) || str_contains($path, '..')
                    || !in_array($extension, $allowed, true)
                    || !app(\App\Services\LegacyFtpStorage::class)->privateDisk()->exists($path)
                    || app(\App\Services\LegacyFtpStorage::class)->privateDisk()->size($path) > 10 * 1024 * 1024) {
                    return response()->json(['message' => $label.' attachment is missing or invalid.'], 422);
                }
                $attachments[] = ['path' => $path, 'name' => $label.'.'.$extension];
            }
        }

        $draft = DB::transaction(function () use ($id) {
            $draft = JobEmailDraft::lockForUpdate()->findOrFail($id);
            if ($draft->approvalStatus !== 'APPROVED' || $draft->status !== 'READY') {
                abort(409, 'A draft needs explicit approval before sending.');
            }
            $contact = $draft->recruiterContactId
                ? RecruiterContact::find($draft->recruiterContactId)
                : null;
            if (!$contact || !$contact->verified || $contact->contactEmailStatus !== 'approved'
                || strtolower($contact->email) !== strtolower($draft->toEmail)) {
                abort(422, 'Recipient must be a verified recruiter contact.');
            }
            $settings = JobAgentSettings::lockForUpdate()->firstOrCreate(['id' => 1], [
                'autoSendEnabled' => false, 'dailySendLimit' => 5, 'sendsToday' => 0,
            ]);
            $date = now()->startOfDay();
            $used = $settings->sendLimitDate?->isSameDay($date) ? $settings->sendsToday : 0;
            $limit = max(1, min(5, (int) $settings->dailySendLimit));
            if ($used >= $limit) {
                abort(429, 'Daily email send limit reached.');
            }
            $settings->forceFill(['sendLimitDate' => $date, 'sendsToday' => $used + 1])->save();
            $draft->forceFill(['status' => 'SENDING', 'sendStatus' => 'sending', 'lastSendAttemptAt' => now()])->save();
            return $draft;
        }, 3);

        try {
            // SMTP is opt-in and attachments are independently opt-in for each send.
            Mail::mailer('job_agent_smtp')->raw($draft->body, function ($message) use ($draft, $attachments, $fromEmail, $fromName): void {
                $message->from($fromEmail, $fromName);
                $message->to($draft->toEmail)->subject($draft->subject);
                foreach ($attachments as $file) {
                    $message->attachData(
                        app(\App\Services\LegacyFtpStorage::class)->privateDisk()->get($file['path']),
                        $file['name']
                    );
                }
            });
            $draft->forceFill(['status' => 'SENT', 'sendStatus' => 'sent', 'sentAt' => now()])->save();
            JobAgentEmailEvent::create([
                'draftId' => $draft->id, 'jobPostId' => $draft->jobPostId,
                'recipientEmail' => $draft->toEmail, 'eventType' => 'SENT',
                'trackingId' => $draft->trackingId, 'url' => '',
                'userAgent' => '', 'ipHash' => '',
            ]);
            return response()->json(['message' => 'Email sent.', 'draft' => $draft->fresh()]);
        } catch (\Throwable $error) {
            // Keep FAILED rather than READY: uncertain SMTP outcomes require manual review.
            $draft->forceFill([
                'status' => 'FAILED', 'sendStatus' => 'unknown',
                'errorMessage' => 'SMTP delivery unconfirmed; inspect server logs before retrying.',
            ])->save();
            report($error);
            return response()->json(['message' => 'Email delivery unconfirmed. Do not retry automatically.'], 502);
        }
    }
}
