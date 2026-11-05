<?php

namespace App\Services;

use App\Models\AdminUser;
use App\Models\AiProvider;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

final class LegacyCredentialCodec
{
    /**
     * Old Express stored a Base32 TOTP seed directly. Laravel now encrypts
     * it at rest. Migration happens only after a valid password or authorized
     * admin action, never by disabling or bypassing 2FA.
     */
    public static function isLegacyTotpSecret(string $value): bool
    {
        return preg_match('/^[A-Z2-7]{16,128}$/D', strtoupper($value)) === 1;
    }

    public static function totpSecret(AdminUser $admin): string
    {
        $value = trim((string) $admin->twoFactorSecret);
        if ($value === '') {
            return '';
        }

        if (self::isLegacyTotpSecret($value)) {
            $value = strtoupper($value);
            // Ensure it is never left as plaintext after it is read.
            $admin->forceFill(['twoFactorSecret' => Crypt::encryptString($value)])->save();
            return $value;
        }

        $decoded = Crypt::decryptString($value);
        if (!self::isLegacyTotpSecret($decoded)) {
            throw new \RuntimeException('Stored TOTP secret is invalid.');
        }
        return strtoupper($decoded);
    }

    /**
     * Original Node encryption.js uses a SHA-256 key derived from
     * AI_ENCRYPTION_KEY (falling back to ADMIN_JWT_SECRET) and AES-256-GCM.
     * The serialization is ivHex:authTagHex:ciphertextHex.
     */
    public static function decryptLegacyAesGcm(string $value, string $secret): string
    {
        if ($secret === '' || !preg_match('/^[0-9a-f]{32}:[0-9a-f]{32}:(?:[0-9a-f]{2})+$/iD', $value)) {
            throw new \RuntimeException('Legacy AI credential cannot be decrypted with current migration configuration.');
        }
        [$iv, $tag, $data] = explode(':', $value, 3);
        $plain = openssl_decrypt(
            hex2bin($data), 'aes-256-gcm', hash('sha256', $secret, true),
            OPENSSL_RAW_DATA, hex2bin($iv), hex2bin($tag)
        );
        if (!is_string($plain) || $plain === '') {
            throw new \RuntimeException('Legacy AI credential decryption failed.');
        }
        return $plain;
    }

    public static function storedSecret(Model $model, string $attribute): string
    {
        $allowed = ['apiKey', 'gmailRefreshToken', 'smtpPasswordEncrypted',
            'openaiApiKeyEncrypted', 'deepseekApiKeyEncrypted', 'geminiApiKeyEncrypted'];
        if (!in_array($attribute, $allowed, true)) {
            throw new \InvalidArgumentException('Unsupported credential field.');
        }
        $stored = (string) $model->getAttribute($attribute);
        if ($stored === '') {
            return '';
        }
        if (preg_match('/^[0-9a-f]{32}:[0-9a-f]{32}:/iD', $stored) === 1) {
            $secret = (string) config('services.portfolio_ai.legacy_encryption_secret', '');
            $key = self::decryptLegacyAesGcm($stored, $secret);
            $model->forceFill([$attribute => Crypt::encryptString($key)])->save();
            return $key;
        }
        return Crypt::decryptString($stored);
    }

    public static function aiProviderKey(AiProvider $provider): string
    {
        return self::storedSecret($provider, 'apiKey');
    }
}
