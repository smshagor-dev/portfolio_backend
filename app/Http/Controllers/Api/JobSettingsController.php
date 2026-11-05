<?php

namespace App\Http\Controllers\Api;

use App\Models\CvProfile;
use App\Models\Education;
use App\Models\Experience;
use App\Models\JobAgentAiSetting;
use App\Models\JobAgentEmailEvent;
use App\Models\JobAgentEmailSetting;
use Illuminate\Support\Facades\Crypt;
use App\Models\JobAgentSettings;
use App\Models\JobSearchPreference;
use App\Models\Profile;
use App\Models\Project;
use App\Models\Skill;
use App\Services\PortfolioAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class JobSettingsController extends Controller
{
    public function profile(): JsonResponse
    {
        return response()->json(['profileContext' => [
            'profile' => Profile::find(1), 'skills' => Skill::orderBy('sortOrder')->get(),
            'projects' => Project::orderBy('sortOrder')->get(),
            'experience' => Experience::orderBy('sortOrder')->get(),
            'education' => Education::orderBy('sortOrder')->get(),
            'cvProfiles' => CvProfile::orderByDesc('createdAt')->get(),
        ]]);
    }

    public function notes(Request $request): JsonResponse
    {
        $input = $request->validate([
            'extraNotes' => ['required', 'string', 'max:30000'],
            'targetRoles' => ['sometimes', 'array'],
            'targetRoles.*' => ['string', 'max:191'],
            'preferredCountries' => ['sometimes', 'array'],
            'preferredCountries.*' => ['string', 'max:191'],
        ]);
        $profile = CvProfile::firstOrNew(['id' => 1]);
        $profile->fill(array_merge(['title' => 'Default CV Profile', 'isDefault' => true], $input));
        $profile->save();
        return response()->json(['cvProfile' => $profile->fresh()]);
    }

    public function uploadCv(Request $request, \App\Services\LegacyFtpStorage $ftp): JsonResponse
    {
        $request->validate([
            'cv' => ['required', 'file', 'mimes:pdf,doc,docx', 'max:10240'],
        ]);
        $file = $request->file('cv');
        $path = $ftp->uploadPrivate($file, 'job-cv');
        try {
            $profile = CvProfile::firstOrNew(['id' => 1]);
            $profile->fill([
                'title' => 'Default CV Profile', 'isDefault' => true, 'extraNotes' => $profile->extraNotes ?? '',
                'resumeUrl' => $path, 'resumeFileName' => $file->getClientOriginalName(),
                'resumeUpdatedAt' => now(),
            ])->save();
        } catch (\Throwable $error) {
            $ftp->deletePrivate($path);
            throw $error;
        }
        return response()->json(['message' => 'CV stored privately on FTP.', 'cvProfile' => $profile->fresh()], 201);
    }

    public function general(): JsonResponse
    {
        $settings = JobAgentSettings::find(1);
        return response()->json(['settings' => [
            'dailySendLimit' => $settings?->dailySendLimit ?: 5,
            'autoSendEnabled' => false,
            'gmailConnectedEmail' => $settings?->gmailConnectedEmail ?: '',
        ]]);
    }

    public function updateGeneral(Request $request): JsonResponse
    {
        $input = $request->validate([
            'dailySendLimit' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'autoSendEnabled' => ['sometimes', 'boolean'],
        ]);
        abort_if(($input['autoSendEnabled'] ?? false) === true, 422, 'Auto-send is not enabled.');
        $settings = JobAgentSettings::firstOrNew(['id' => 1]);
        $settings->forceFill(array_merge($input, ['autoSendEnabled' => false]))->save();
        return $this->general();
    }

    public function emailSettings(): JsonResponse
    {
        $model = JobAgentEmailSetting::find(1);
        $enabled = (bool) $model?->isEnabled && (bool) config('job_agent.allow_sending');
        return response()->json(['settings' => [
            'fromName' => $model?->fromName ?: config('mail.from.name'),
            'fromEmail' => $model?->fromEmail ?: config('mail.from.address'),
            'smtpHost' => $model?->smtpHost ?: config('mail.mailers.smtp.host'),
            'smtpPort' => $model?->smtpPort ?: config('mail.mailers.smtp.port'),
            'smtpSecure' => (bool) ($model?->smtpSecure ?? true),
            'smtpUsername' => $model?->smtpUsername ?: config('mail.mailers.smtp.username'),
            'passwordConfigured' => (bool) ($model?->smtpPasswordEncrypted ?: config('mail.mailers.smtp.password')),
            'isEnabled' => $enabled,
            'configuredEnabled' => (bool) $model?->isEnabled,
            'dailySendLimit' => $model?->dailySendLimit ?: 5,
            'openTrackingEnabled' => (bool) $model?->openTrackingEnabled && (bool) config('job_agent.tracking_enabled'),
            'clickTrackingEnabled' => (bool) $model?->clickTrackingEnabled && (bool) config('job_agent.tracking_enabled'),
        ]]);
    }

    public function updateEmailSettings(Request $request): JsonResponse
    {
        $input = $request->validate([
            'fromName' => ['sometimes', 'string', 'max:191'],
            'fromEmail' => ['sometimes', 'email', 'max:191'],
            'smtpHost' => ['sometimes', 'string', 'max:255', 'regex:/^[a-zA-Z0-9.-]+$/'],
            'smtpPort' => ['sometimes', 'integer', 'min:1', 'max:65535'],
            'smtpSecure' => ['sometimes', 'boolean'],
            'smtpUsername' => ['sometimes', 'string', 'max:191'],
            'smtpPassword' => ['sometimes', 'nullable', 'string', 'max:1024'],
            'isEnabled' => ['sometimes', 'boolean'],
            'dailySendLimit' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'openTrackingEnabled' => ['sometimes', 'boolean'],
            'clickTrackingEnabled' => ['sometimes', 'boolean'],
        ]);
        $model = JobAgentEmailSetting::firstOrNew(['id' => 1]);
        if (isset($input['smtpPassword']) && $input['smtpPassword'] !== '') {
            $model->forceFill(['smtpPasswordEncrypted' => Crypt::encryptString($input['smtpPassword'])]);
        }
        unset($input['smtpPassword']);
        $model->fill($input)->save();
        return $this->emailSettings();
    }

    public function aiSettings(): JsonResponse
    {
        $settings = JobAgentAiSetting::find(1);
        return response()->json(['settings' => [
            'aiProvider' => $settings?->aiProvider ?? 'OPENAI',
            'aiModel' => $settings?->aiModel ?? config('services.portfolio_ai.model'),
            'requireAdminApproval' => true,
            'tone' => $settings?->tone ?: 'professional-natural',
            'maxEmailWords' => $settings?->maxEmailWords ?: 160,
            'maxCoverLetterWords' => $settings?->maxCoverLetterWords ?: 450,
            'providerKeysConfigured' => (bool) config('services.portfolio_ai.api_key'),
        ]]);
    }

    public function updateAiSettings(Request $request): JsonResponse
    {
        $input = $request->validate([
            'aiProvider' => ['sometimes', 'in:OPENAI,DEEPSEEK,GEMINI'],
            'aiModel' => ['sometimes', 'string', 'max:100'],
            'tone' => ['sometimes', 'string', 'max:191'],
            'maxEmailWords' => ['sometimes', 'integer', 'min:50', 'max:500'],
            'maxCoverLetterWords' => ['sometimes', 'integer', 'min:100', 'max:1000'],
        ]);
        $settings = JobAgentAiSetting::firstOrNew(['id' => 1]);
        $settings->forceFill(array_merge([
            'systemPrompt' => '', 'recruiterEmailPrompt' => '', 'coverLetterPrompt' => '',
            'requireAdminApproval' => true, 'autoGenerateCoverLetter' => false,
        ], $input))->save();
        return $this->aiSettings();
    }

    public function preview(Request $request, PortfolioAiService $service): JsonResponse
    {
        $data = $request->validate([
            'jobTitle' => ['required', 'string', 'max:191'],
            'company' => ['required', 'string', 'max:191'],
            'description' => ['required', 'string', 'max:12000'],
            'kind' => ['required', 'in:email,cover-letter'],
        ]);
        try {
            $result = $service->reply(
                'Write a professional, accurate '.$data['kind'].' draft based on the portfolio facts only. '
                .'Do not invent credentials or work history. Job: '.$data['jobTitle'].
                ' Company: '.$data['company'].' Description: '.$data['description']
                , true);
            return response()->json(['preview' => $result]);
        } catch (\Throwable $error) {
            report($error);
            return response()->json(['message' => 'AI preview failed.'], 503);
        }
    }

    public function events(): JsonResponse
    {
        return response()->json(['events' => JobAgentEmailEvent::orderByDesc('createdAt')->paginate(50)]);
    }

    public function preferences(): JsonResponse
    {
        return response()->json(['preferences' => JobSearchPreference::find(1)]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $input = $request->validate([
            'rolesJson' => ['sometimes', 'array'], 'rolesJson.*' => ['string', 'max:191'],
            'customKeywordsJson' => ['sometimes', 'array'],
            'jobTypesJson' => ['sometimes', 'array'], 'workModesJson' => ['sometimes', 'array'],
            'regionsJson' => ['sometimes', 'array'], 'experienceLevelsJson' => ['sometimes', 'array'],
            'preferredLanguagesJson' => ['sometimes', 'array'],
            'maxJobsPerSync' => ['sometimes', 'integer', 'min:1', 'max:40'],
            'minimumMatchScoreToDraft' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'autoDraftEnabled' => ['sometimes', 'boolean'],
        ]);
        $pref = JobSearchPreference::firstOrNew(['id' => 1]);
        $pref->fill($input)->save();
        return response()->json(['preferences' => $pref->fresh()]);
    }
}
