<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ContactChatMessage extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ContactChatMessage';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = null;
    protected $fillable = ['contactMessageId', 'senderType', 'senderName', 'message', 'photo', 'file'];

    protected $casts = [
        'contactMessageId' => 'integer',
        'createdAt' => 'datetime',
    ];
}
