<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumToken;
use MongoDB\Laravel\Eloquent\DocumentModel;

class PersonalAccessToken extends SanctumToken
{
    use DocumentModel;

    protected $connection = 'mongodb';
    protected $table = 'personal_access_tokens';
    protected $keyType = 'string';
    public $incrementing = false;

    /**
     * MongoDB stores the Sanctum token primary key as a BSON ObjectId.
     * Sanctum's inherited findToken() looks it up by string ID and can
     * fail to coerce that ID on the MongoDB driver. Verify the hashed token
     * against the indexed token field, then enforce the embedded ID as well.
     * Never authorize based on the ID alone.
     */
    public static function findToken($token)
    {
        if (!is_string($token) || $token === '') {
            return null;
        }

        if (!str_contains($token, '|')) {
            return static::query()
                ->where('token', hash('sha256', $token))
                ->first();
        }

        [$id, $plain] = explode('|', $token, 2);
        if ($id === '' || $plain === '' || strlen($id) > 128) {
            return null;
        }

        $match = static::query()
            ->where('token', hash('sha256', $plain))
            ->first();

        if (!$match) {
            return null;
        }

        $storedId = (string) $match->getKey();
        return hash_equals($storedId, $id) ? $match : null;
    }
}
