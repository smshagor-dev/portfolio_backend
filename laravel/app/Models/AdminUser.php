<?php

namespace App\Models;

use MongoDB\Laravel\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class AdminUser extends Authenticatable
{

    use HasApiTokens;
    use \App\Models\Concerns\UsesPrismaNumericId;

    public function getAuthPassword(): string
    {
        return $this->passwordHash;
    }
    protected $table = 'AdminUser';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['name', 'email', 'twoFactorEnabled'];
    protected $hidden = ['passwordHash', 'twoFactorSecret'];

    protected $casts = [
        'twoFactorEnabled' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];
}
