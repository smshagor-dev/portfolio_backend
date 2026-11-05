<?php

namespace App\Services;

use App\Models\JobAgentSettings;
use App\Models\JobPost;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use App\Services\LegacyCredentialCodec;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GmailJobAlertService
{
    private const QUERY = 'from:(linkedin.com OR indeed.com OR glassdoor.com) subject:(job OR jobs OR alert) newer_than:30d';

    public static function isApprovedSender(string $header): bool
    {
        // Parse the actual mailbox, not a substring of a display name or
        // a lookalike domain such as linkedin.com.attacker.example.
        if (preg_match('/<([^<>]+)>/', $header, $match)) {
            $header = $match[1];
        }
        $address = strtolower(trim($header, " \t\n\r\0\x0B\"'"));
        if (!filter_var($address, FILTER_VALIDATE_EMAIL)) {
            return false;
        }
        $domain = substr(strrchr($address, '@'), 1);
        return in_array($domain, ['linkedin.com', 'indeed.com', 'glassdoor.com'], true);
    }


    public function status(): array
    {
        $settings = JobAgentSettings::find(1);
        $configured = (bool) config('services.gmail.client_id')
            && (bool) config('services.gmail.client_secret')
            && (bool) config('services.gmail.redirect_uri');
        return [
            'oauthConfigured' => $configured,
            'connected' => (bool) $settings?->gmailRefreshToken,
            'email' => $settings?->gmailConnectedEmail ?: '',
            'lastSyncedAt' => Cache::get('gmail:last_sync'),
            'status' => !$configured ? 'CONFIG_REQUIRED' : ($settings?->gmailRefreshToken ? 'CONNECTED' : 'READY_TO_CONNECT'),
        ];
    }

    public function authorizationUrl(int $adminId): string
    {
        if (!$this->status()['oauthConfigured']) {
            throw new \RuntimeException('Google OAuth is not configured.');
        }
        $state = bin2hex(random_bytes(24));
        Cache::put('gmail:oauth:'.$state, $adminId, now()->addMinutes(10));
        return 'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query([
            'client_id' => config('services.gmail.client_id'),
            'redirect_uri' => config('services.gmail.redirect_uri'),
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
            'state' => $state, 'access_type' => 'offline', 'prompt' => 'consent',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    public function exchange(string $state, string $code): void
    {
        if (!preg_match('/^[a-f0-9]{48}$/D', $state) || strlen($code) > 3000) {
            throw new \InvalidArgumentException('Invalid Gmail OAuth response.');
        }
        $adminId = Cache::pull('gmail:oauth:'.$state);
        if (!$adminId || !\App\Models\AdminUser::find($adminId)) {
            throw new \InvalidArgumentException('OAuth state expired or invalid.');
        }
        $response = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => config('services.gmail.client_id'),
            'client_secret' => config('services.gmail.client_secret'),
            'redirect_uri' => config('services.gmail.redirect_uri'),
            'grant_type' => 'authorization_code',
        ])->throw()->json();
        $refresh = $response['refresh_token'] ?? null;
        if (!$refresh) {
            throw new \RuntimeException('Google did not return a refresh token; reconnect with consent.');
        }
        $profile = Http::withToken($response['access_token'])->timeout(15)
            ->get('https://www.googleapis.com/oauth2/v2/userinfo')->throw()->json();
        $settings = JobAgentSettings::firstOrNew(['id' => 1]);
        $settings->forceFill([
            'gmailConnectedEmail' => $profile['email'] ?? '',
            'gmailRefreshToken' => Crypt::encryptString($refresh),
            'autoSendEnabled' => false,
        ])->save();
    }

    private function accessToken(): string
    {
        $settings = JobAgentSettings::find(1);
        if (!$settings?->gmailRefreshToken) {
            throw new \RuntimeException('Gmail is not connected.');
        }
        $refresh = LegacyCredentialCodec::storedSecret($settings, 'gmailRefreshToken');
        $response = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
            'refresh_token' => $refresh,
            'client_id' => config('services.gmail.client_id'),
            'client_secret' => config('services.gmail.client_secret'),
            'grant_type' => 'refresh_token',
        ])->throw()->json();
        return (string) ($response['access_token'] ?? throw new \RuntimeException('Gmail OAuth token refresh failed.'));
    }

    public function disconnect(): void
    {
        $settings = JobAgentSettings::find(1);
        $settings?->forceFill([
            'gmailConnectedEmail' => '', 'gmailRefreshToken' => '',
            'gmailHistoryId' => '', 'autoSendEnabled' => false,
        ])->save();
    }

    public function sync(): array
    {
        $token = $this->accessToken();
        $response = Http::withToken($token)->timeout(15)->get(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages',
            ['q' => self::QUERY, 'maxResults' => 30]
        )->throw()->json();
        $imported = 0;
        $skipped = 0;
        foreach ($response['messages'] ?? [] as $item) {
            $id = (string) ($item['id'] ?? '');
            if (!preg_match('/^[a-zA-Z0-9_-]{4,128}$/D', $id)) {
                continue;
            }
            $message = Http::withToken($token)->timeout(15)->get(
                'https://gmail.googleapis.com/gmail/v1/users/me/messages/'.rawurlencode($id),
                ['format' => 'metadata', 'metadataHeaders' => ['Subject', 'From', 'Date']]
            )->throw()->json();
            $headers = collect(data_get($message, 'payload.headers', []))->keyBy(
                fn ($item) => strtolower((string) ($item['name'] ?? ''))
            );
            $subject = trim((string) data_get($headers->get('subject'), 'value', ''));
            $from = strtolower((string) data_get($headers->get('from'), 'value', ''));
            if (!$subject || !self::isApprovedSender($from)) {
                $skipped++;
                continue;
            }
            $sourceUrl = 'https://mail.google.com/mail/u/0/#all/'.$id;
            if (JobPost::where('sourceUrl', $sourceUrl)->exists()) {
                $skipped++;
                continue;
            }
            $snippet = Str::limit(trim((string) ($message['snippet'] ?? '')), 4000, '');
            JobPost::create([
                'sourceType' => 'gmail', 'externalId' => 'gmail:'.$id,
                'sourceEmail' => Str::limit($from, 255, ''),
                'sourceSubject' => Str::limit($subject, 255, ''),
                'sourcePlatform' => 'gmail', 'emailSubject' => Str::limit($subject, 255, ''),
                'title' => Str::limit($subject, 191, ''),
                'company' => 'Unknown company', 'location' => '',
                'sourceUrl' => $sourceUrl, 'applyUrl' => $sourceUrl, 'companyUrl' => '',
                'description' => $snippet, 'rawContent' => $snippet,
                'descriptionStatus' => 'DESCRIPTION_REQUIRED',
                'importMethod' => 'EMAIL_ALERT', 'sourceName' => 'Gmail job alerts',
                'status' => 'new',
            ]);
            $imported++;
        }
        Cache::put('gmail:last_sync', now()->toIso8601String(), now()->addDays(7));
        return ['imported' => $imported, 'skipped' => $skipped, 'query' => self::QUERY];
    }
}
