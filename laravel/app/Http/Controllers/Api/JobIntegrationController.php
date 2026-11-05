<?php

namespace App\Http\Controllers\Api;

use App\Models\JobBoardSource;
use App\Models\JobEmailDraft;
use App\Models\JobAgentEmailEvent;
use App\Models\JobAgentSettings;
use App\Models\RecruiterContact;
use App\Services\JobSourceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

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
        if (!config('job_agent.allow_sending') || config('mail.default') !== 'smtp') {
            return response()->json(['message' => 'SMTP sending disabled by server configuration.'], 503);
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
            // Only the server's configured SMTP transport is used. No third-party
            // sender addresses, SMTP credentials or unreviewed attachments.
            Mail::raw($draft->body, function ($message) use ($draft): void {
                $message->to($draft->toEmail)->subject($draft->subject);
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
