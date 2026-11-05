<?php

namespace App\Support;

use Illuminate\Support\Facades\Hash;

/**
 * Accept pre-migration bcryptjs ($2a$/$2b$) hashes without weakening
 * Laravel's global hash algorithm verification.
 */
final class LegacyBcryptPassword
{
    public static function check(string $password, mixed $storedHash): bool
    {
        // Never treat plaintext, truncated values, or unrelated hash formats
        // as passwords. The original Express service used bcryptjs.
        if (!is_string($storedHash) ||
            !preg_match('/^\$2[aby]\$(?:0[4-9]|[12][0-9]|3[01])\$[.\/A-Za-z0-9]{53}$/D', $storedHash)) {
            return false;
        }

        // PHP password_verify supports these bcrypt variants, even when
        // password_get_info (used by Laravel's BcryptHasher) rejects $2a/$2b.
        return password_verify($password, $storedHash);
    }

    public static function needsRehash(string $storedHash): bool
    {
        return !str_starts_with($storedHash, '$2y$') || Hash::needsRehash($storedHash);
    }
}
