<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class AdminNotification extends Model
{
    protected $table = 'AdminNotification';
    protected $primaryKey = 'id';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = true;
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $fillable = ['type', 'title', 'body', 'visitorName', 'visitorEmail', 'visitorPhone', 'messageId', 'conversationId', 'preview', 'actionUrl', 'isRead'];

    protected $casts = [
        'messageId' => 'integer',
        'conversationId' => 'integer',
        'isRead' => 'boolean',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function ($model): void {
            if (!$model->id) {
                $model->id = (string) \Illuminate\Support\Str::orderedUuid();
            }
        });
    }
}
