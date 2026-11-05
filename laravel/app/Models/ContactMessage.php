<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class ContactMessage extends Model
{
    use \App\Models\Concerns\UsesPrismaNumericId;

    protected $table = 'ContactMessage';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'int';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = null;
    protected $hidden = ['ticketToken'];
    protected $fillable = ['name', 'email', 'subject', 'message', 'photo', 'file', 'status', 'ticketToken'];

    protected $casts = [
        'createdAt' => 'datetime',
    ];
    public function chatMessages(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ContactChatMessage::class, 'contactMessageId')->orderBy('createdAt');
    }

}
