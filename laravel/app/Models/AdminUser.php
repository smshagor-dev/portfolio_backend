<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class AdminUser extends Authenticatable
{

    use HasApiTokens;

    public function getAuthPassword(): string
    {
        return $this->passwordHash;
    }
    protected $table = 'admin_users';
    protected $primaryKey = 'id';
    public $incrementing = true;
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
