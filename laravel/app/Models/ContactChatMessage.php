<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactChatMessage extends Model
{
    protected $table = 'contact_chat_messages';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['contactMessageId', 'senderType', 'senderName', 'message', 'photo', 'file'];

    protected $casts = [
        'contactMessageId' => 'integer',
        'createdAt' => 'datetime',
    ];
}
