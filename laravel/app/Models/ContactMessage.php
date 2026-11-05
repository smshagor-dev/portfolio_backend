<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactMessage extends Model
{
    protected $table = 'contact_messages';
    protected $primaryKey = 'id';
    public $incrementing = true;
    public $timestamps = false;
    protected $fillable = ['name', 'email', 'subject', 'message', 'photo', 'file', 'status', 'ticketToken'];

    protected $casts = [
        'createdAt' => 'datetime',
    ];
    public function chatMessages(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ContactChatMessage::class, 'contactMessageId')->orderBy('createdAt');
    }

}
