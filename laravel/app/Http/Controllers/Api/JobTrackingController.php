<?php

namespace App\Http\Controllers\Api;

use App\Models\JobAgentEmailEvent;
use App\Models\JobAgentEmailSetting;
use App\Models\JobEmailDraft;
use App\Models\JobPost;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class JobTrackingController extends Controller
{
    // A valid transparent 1x1 PNG. No personal data is embedded in the image.
    private const PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

    public function open(Request $request, string $trackingId)
    {
        if ($this->enabled('openTrackingEnabled')) {
            try {
                $draft = JobEmailDraft::where('trackingId', $trackingId)
                    ->whereIn('status', ['SENT', 'OPENED', 'CLICKED'])->first();
                if ($draft) {
                    DB::transaction(function () use ($draft, $request): void {
                        $fresh = JobEmailDraft::lockForUpdate()->findOrFail($draft->id);
                        $fresh->forceFill([
                            'status' => $fresh->status === 'CLICKED' ? 'CLICKED' : 'OPENED',
                            'openedAt' => $fresh->openedAt ?? now(),
                            'lastOpenedAt' => now(),
                            'openCount' => $fresh->openCount + 1,
                        ])->save();
                        $this->event($fresh, 'OPENED', '', $request);
                    });
                }
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
        return response(base64_decode(self::PIXEL_BASE64), 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function click(Request $request, string $trackingId)
    {
        $draft = JobEmailDraft::where('trackingId', $trackingId)
            ->whereIn('status', ['SENT', 'OPENED', 'CLICKED'])->firstOrFail();
        $job = JobPost::findOrFail($draft->jobPostId);
        $target = trim((string) $request->query('url', ''));
        $approved = array_filter([(string) $job->applyUrl, (string) $job->sourceUrl]);
        // Redirect only to a URL already stored against the job.
        abort_unless($target && in_array($target, $approved, true), 400, 'Unapproved destination.');
        abort_unless(preg_match('~^https://[^/]+~i', $target), 400, 'HTTPS destination required.');

        if ($this->enabled('clickTrackingEnabled')) {
            try {
                DB::transaction(function () use ($draft, $request, $target): void {
                    $fresh = JobEmailDraft::lockForUpdate()->findOrFail($draft->id);
                    $fresh->forceFill([
                        'status' => 'CLICKED',
                        'clickedAt' => $fresh->clickedAt ?? now(),
                        'clickCount' => $fresh->clickCount + 1,
                    ])->save();
                    $this->event($fresh, 'CLICKED', $target, $request);
                });
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
        return redirect()->away($target, 302, ['Referrer-Policy' => 'no-referrer']);
    }

    private function enabled(string $name): bool
    {
        if (!config('job_agent.tracking_enabled')) {
            return false;
        }
        $settings = JobAgentEmailSetting::find(1);
        return (bool) $settings?->{$name};
    }

    private function event(JobEmailDraft $draft, string $type, string $url, Request $request): void
    {
        JobAgentEmailEvent::create([
            'draftId' => $draft->id, 'jobPostId' => $draft->jobPostId,
            'recipientEmail' => $draft->toEmail,
            'eventType' => $type, 'trackingId' => $draft->trackingId, 'url' => $url,
            'userAgent' => substr((string) $request->userAgent(), 0, 1900),
            'ipHash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
        ]);
    }
}
