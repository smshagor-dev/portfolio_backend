<?php

namespace App\Services;

use App\Models\AdminNotification;
use App\Models\ContactMessage;
use Illuminate\Support\Facades\Mail;

class ContactNotificationService
{
    public function onCreated(ContactMessage $ticket): void
    {
        AdminNotification::create([
            'type' => 'NEW_MESSAGE', 'title' => 'New portfolio message',
            'body' => $ticket->subject,
            'visitorName' => $ticket->name,
            'visitorEmail' => $ticket->email,
            'messageId' => $ticket->id, 'conversationId' => $ticket->id,
            'preview' => mb_substr($ticket->message, 0, 250),
            'actionUrl' => '/admin/messages/'.$ticket->id,
            'isRead' => false,
        ]);
        $destination = (string) config('contact_notifications.admin_email');
        if ($destination) {
            $this->notify($destination, 'New portfolio contact: '.$ticket->subject,
                'A new contact ticket #'.$ticket->id.' was received. View it in the authenticated admin dashboard.');
        }
    }

    public function onVisitorReply(ContactMessage $ticket, string $body): void
    {
        AdminNotification::create([
            'type' => 'MESSAGE_REPLY', 'title' => 'Visitor replied to ticket',
            'body' => $ticket->subject,
            'visitorName' => $ticket->name, 'visitorEmail' => $ticket->email,
            'messageId' => $ticket->id, 'conversationId' => $ticket->id,
            'preview' => mb_substr($body, 0, 250),
            'actionUrl' => '/admin/messages/'.$ticket->id,
            'isRead' => false,
        ]);
        $destination = (string) config('contact_notifications.admin_email');
        if ($destination) {
            $this->notify($destination, 'Contact ticket reply #'.$ticket->id,
                'A visitor replied to ticket #'.$ticket->id.'. Log into the admin dashboard to read the conversation.');
        }
    }

    public function onAdminReply(ContactMessage $ticket): void
    {
        $this->notify($ticket->email, 'Re: '.$ticket->subject,
            'You have a new reply to your portfolio contact ticket #'.$ticket->id.'. '
            .'Use your original private ticket link to view it. Do not share the link.');
    }

    private function notify(string $email, string $subject, string $body): void
    {
        if (!config('contact_notifications.email_enabled') || config('mail.default') !== 'smtp') {
            return;
        }
        try {
            Mail::raw($body, fn ($message) => $message->to($email)->subject($subject));
        } catch (\Throwable $error) {
            report($error);
        }
    }
}
