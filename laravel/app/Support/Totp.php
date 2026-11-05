<?php

namespace App\Support;

final class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(): string
    {
        $bytes = random_bytes(20);
        $bits = '';
        foreach (str_split($bytes) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }
        $secret = '';
        foreach (str_split($bits, 5) as $chunk) {
            $secret .= self::ALPHABET[bindec(str_pad($chunk, 5, '0'))];
        }
        return $secret;
    }

    private static function decode(string $encoded): string
    {
        $bits = '';
        foreach (str_split(strtoupper(str_replace(' ', '', $encoded))) as $character) {
            $index = strpos(self::ALPHABET, $character);
            if ($index === false) {
                throw new \InvalidArgumentException('Invalid TOTP secret.');
            }
            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }
        $binary = '';
        foreach (str_split(substr($bits, 0, strlen($bits) - strlen($bits) % 8), 8) as $byte) {
            $binary .= chr(bindec($byte));
        }
        return $binary;
    }

    public static function verify(string $secret, string $code, int $timestamp = 0): bool
    {
        if (!preg_match('/^\d{6}$/D', $code)) {
            return false;
        }
        $counter = intdiv($timestamp > 0 ? $timestamp : time(), 30);
        $key = self::decode($secret);
        foreach ([-1, 0, 1] as $offset) {
            $count = $counter + $offset;
            $binary = pack('N2', 0, $count);
            $hash = hash_hmac('sha1', $binary, $key, true);
            $index = ord(substr($hash, -1)) & 15;
            $value = unpack('N', substr($hash, $index, 4))[1] & 0x7fffffff;
            $otp = str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
            if (hash_equals($otp, $code)) {
                return true;
            }
        }
        return false;
    }
}
