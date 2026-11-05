<?php

namespace Tests\Feature;

use App\Services\LegacyCredentialCodec;
use PHPUnit\Framework\TestCase;

class LegacyCredentialCodecTest extends TestCase
{
    public function test_recognizes_original_express_base32_totp_and_rejects_unsafe_values(): void
    {
        $this->assertTrue(LegacyCredentialCodec::isLegacyTotpSecret('JBSWY3DPEHPK3PXP'));
        $this->assertFalse(LegacyCredentialCodec::isLegacyTotpSecret('not-a-key!'));
        $this->assertFalse(LegacyCredentialCodec::isLegacyTotpSecret(''));
    }

    public function test_decrypts_node_compatible_aes_256_gcm_key_format(): void
    {
        $secret = 'migration-test-secret-only';
        $iv = random_bytes(16);
        $tag = '';
        $original = 'provider-key-test-123';
        $cipher = openssl_encrypt($original, 'aes-256-gcm', hash('sha256', $secret, true), OPENSSL_RAW_DATA, $iv, $tag);
        $serialized = bin2hex($iv).':'.bin2hex($tag).':'.bin2hex($cipher);
        $this->assertSame($original, LegacyCredentialCodec::decryptLegacyAesGcm($serialized, $secret));
        $this->expectException(\RuntimeException::class);
        LegacyCredentialCodec::decryptLegacyAesGcm($serialized, 'incorrect-secret');
    }
}
