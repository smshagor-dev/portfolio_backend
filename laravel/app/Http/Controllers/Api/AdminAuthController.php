<?php

namespace App\Http\Controllers\Api;

use App\Models\AdminUser;
use App\Support\Totp;
use App\Services\LegacyCredentialCodec;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AdminAuthController extends Controller
{
    private function publicAdmin(AdminUser $admin): array
    {
        return $admin->only(['id', 'name', 'email', 'twoFactorEnabled', 'createdAt', 'updatedAt']);
    }

    public function login(Request $request): JsonResponse
    {
        $input = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string'],
            // Laravel converts an empty submitted string to null; 2FA is optional
            // until enabled for this admin, so don't reject the initial login.
            'twoFactorCode' => ['sometimes', 'nullable', 'string'],
        ]);

        $admin = AdminUser::where('email', strtolower($input['email']))->first();
        if (!$admin || !Hash::check($input['password'], $admin->passwordHash)) {
            return response()->json(['message' => 'Invalid email or password.'], 401);
        }

        if ($admin->twoFactorEnabled) {
            if (empty($input['twoFactorCode'])) {
                return response()->json(['requiresTwoFactor' => true, 'message' => 'Enter your 2FA code to continue.']);
            }
            $secret = $admin->twoFactorSecret ? LegacyCredentialCodec::totpSecret($admin) : '';
            if (!$secret || !Totp::verify($secret, $input['twoFactorCode'])) {
                return response()->json(['message' => 'Invalid 2FA code.'], 401);
            }
        }

        $token = $admin->createToken('portfolio-admin', ['admin'], now()->addDays(7));
        return response()->json(['token' => $token->plainTextToken, 'admin' => $this->publicAdmin($admin)]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['admin' => $this->publicAdmin($request->user())]);
    }

    public function updateMe(Request $request): JsonResponse
    {
        $input = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:191'],
            'email' => ['sometimes', 'required', 'email', 'max:191'],
        ]);
        if (isset($input['email'])) {
            $input['email'] = strtolower(trim($input['email']));
            $other = AdminUser::where('email', $input['email'])->first();
            if ($other && (string) $other->getKey() !== (string) $request->user()->getKey()) {
                throw ValidationException::withMessages(['email' => 'This email is already in use.']);
            }
        }
        $request->user()->update($input);
        return response()->json(['admin' => $this->publicAdmin($request->user()->fresh())]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $input = $request->validate([
            'currentPassword' => ['required', 'string'],
            'newPassword' => ['required', 'confirmed', Password::min(12)->mixedCase()->numbers()],
        ]);
        $admin = $request->user();
        if (!Hash::check($input['currentPassword'], $admin->passwordHash)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }
        $admin->forceFill(['passwordHash' => Hash::make($input['newPassword'])])->save();
        $admin->tokens()->delete();
        return response()->json(['message' => 'Password changed. Sign in again.']);
    }

    public function twoFactorSetup(Request $request): JsonResponse
    {
        $admin = $request->user();
        if ($admin->twoFactorEnabled) {
            return response()->json(['message' => '2FA is already enabled.'], 409);
        }
        $secret = Totp::generateSecret();
        $admin->forceFill(['twoFactorSecret' => Crypt::encryptString($secret)])->save();
        $label = rawurlencode($admin->email);
        $issuer = rawurlencode('Portfolio Admin');
        $otpAuthUrl = "otpauth://totp/{$issuer}:{$label}?secret={$secret}&issuer={$issuer}&algorithm=SHA1&digits=6&period=30";
        return response()->json(['manualEntryKey' => $secret, 'otpAuthUrl' => $otpAuthUrl]);
    }

    public function twoFactorEnable(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'digits:6']]);
        $admin = $request->user();
        $secret = $admin->twoFactorSecret ? LegacyCredentialCodec::totpSecret($admin) : '';
        if ($admin->twoFactorEnabled || !$secret || !Totp::verify($secret, $request->string('code')->toString())) {
            return response()->json(['message' => 'Invalid setup or verification code.'], 422);
        }
        $admin->forceFill(['twoFactorEnabled' => true])->save();
        return response()->json(['message' => '2FA enabled successfully.']);
    }

    public function twoFactorDisable(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'digits:6']]);
        $admin = $request->user();
        $secret = $admin->twoFactorSecret ? LegacyCredentialCodec::totpSecret($admin) : '';
        if (!$admin->twoFactorEnabled || !$secret || !Totp::verify($secret, $request->string('code')->toString())) {
            return response()->json(['message' => 'Invalid 2FA code.'], 422);
        }
        $admin->forceFill(['twoFactorEnabled' => false, 'twoFactorSecret' => null])->save();
        $admin->tokens()->delete();
        return response()->json(['message' => '2FA disabled. Sign in again.']);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();
        return response()->json(['message' => 'Signed out.']);
    }
}
