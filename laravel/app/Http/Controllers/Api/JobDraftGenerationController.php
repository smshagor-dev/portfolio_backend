<?php

namespace App\Http\Controllers\Api;

use App\Models\JobEmailDraft;
use App\Models\JobPost;
use App\Models\Profile;
use App\Models\RecruiterContact;
use App\Services\JobMatchService;
use App\Services\PortfolioAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

class JobDraftGenerationController extends Controller
{
    public function match(int $id, JobMatchService $service): JsonResponse
    {
        $job = JobPost::findOrFail($id);
        return response()->json(['match' => $service->evaluate($job)]);
    }

    public function contacts(int $id): JsonResponse
    {
        JobPost::findOrFail($id);
        return response()->json(['contacts' => RecruiterContact::where('jobPostId', $id)->get()]);
    }

    public function draft(Request $request, int $id, PortfolioAiService $ai): JsonResponse
    {
        $job = JobPost::findOrFail($id);
        $input = $request->validate([
            'recruiterContactId' => ['required', 'integer', 'min:1'],
            'instructions' => ['sometimes', 'string', 'max:1200'],
        ]);
        $contact = RecruiterContact::where('jobPostId', $job->id)->findOrFail($input['recruiterContactId']);
        abort_unless($contact->verified && $contact->contactEmailStatus === 'approved', 422, 'Contact requires manual verification.');
        $profile = Profile::find(1);
        abort_unless($profile, 422, 'Portfolio profile is required for drafting.');

        $prompt = 'Draft a concise, natural job inquiry email, strictly based on the following facts. '
            .'No claims about qualifications unless supported by the profile. '
            .'Return the plain-text email body only; do not include a subject or fake experience. '
            .'Applicant: '.json_encode($profile->only(['name', 'designation', 'description', 'github', 'linkedIn'])).'. '
            .'Job: '.json_encode($job->only(['title', 'company', 'location', 'description'])).'. '
            .'Extra instructions: '.($input['instructions'] ?? '');
        try {
            $body = Str::limit($ai->reply($prompt, true), 10000, '');
        } catch (\Throwable $error) {
            report($error);
            return response()->json(['message' => 'AI draft could not be generated. Check configured provider.'], 503);
        }
        $draft = JobEmailDraft::create([
            'jobPostId' => $job->id, 'recruiterContactId' => $contact->id,
            'toEmail' => $contact->email,
            'subject' => Str::limit('Application: '.$job->title.' — '.$profile->name, 190, ''),
            'body' => $body, 'trackingId' => (string) Str::uuid(),
            'aiProvider' => 'configured', 'aiModel' => '',
            'adminApprovalRequired' => true, 'approvalStatus' => 'PENDING',
            'status' => 'DRAFT', 'sendStatus' => 'pending',
        ]);
        return response()->json(['draft' => $draft, 'message' => 'AI draft generated; approval required before sending.'], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $input = $request->validate([
            'subject' => ['sometimes', 'string', 'min:1', 'max:191'],
            'body' => ['sometimes', 'string', 'min:1', 'max:20000'],
            'recruiterContactId' => ['sometimes', 'integer', 'min:1'],
        ]);
        $draft = JobEmailDraft::findOrFail($id);
        abort_unless(in_array($draft->status, ['DRAFT', 'READY', 'REJECTED'], true), 409);
        if (isset($input['recruiterContactId'])) {
            $contact = RecruiterContact::where('jobPostId', $draft->jobPostId)->findOrFail($input['recruiterContactId']);
            abort_unless($contact->verified && $contact->contactEmailStatus === 'approved', 422);
            $input['toEmail'] = $contact->email;
        }
        $draft->update(array_merge($input, [
            'approvalStatus' => 'PENDING', 'status' => 'DRAFT',
            'approvedAt' => null, 'approvedBy' => '',
        ]));
        return response()->json(['draft' => $draft->fresh(), 'message' => 'Draft changed. Reapproval is required.']);
    }
}
