<?php

namespace Tests\Feature;

use App\Support\Totp;
use PHPUnit\Framework\TestCase;

class TotpTest extends TestCase
{
    public function test_secret_generation_and_invalid_codes(): void
    {
        $secret = Totp::generateSecret();
        $this->assertSame(32, strlen($secret));
        $this->assertFalse(Totp::verify($secret, 'invalid'));
    }
}
