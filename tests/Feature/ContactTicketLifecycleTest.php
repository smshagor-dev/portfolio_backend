<?php

namespace Tests\Feature;

use App\Models\AdminNotification;
use App\Models\ContactChatMessage;
use App\Models\ContactMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactTicketLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_visitor_creates_and_replies_to_private_ticket(): void
    {
        config()->set('contact_notifications.email_enabled', false);

        $created = $this->postJson('/api/site/contact', [
            'name' => 'Visitor', 'email' => 'visitor@example.test',
            'subject' => 'Website question', 'message' => 'Hello from a visitor',
        ]);

        $created->assertCreated()->assertJsonStructure(['ticketToken', 'ticket' => ['id', 'subject']]);
        $ticketId = $created->json('ticket.id');
        $ticketToken = $created->json('ticketToken');

        $this->assertSame(64, strlen($ticketToken));
        $this->assertDatabaseCount('contact_messages', 1);
        $this->assertDatabaseCount('contact_chat_messages', 1);
        $this->assertDatabaseCount('admin_notifications', 1);

        $this->getJson('/api/site/contact-ticket/'.$ticketId)->assertNotFound();
        $this->getJson('/api/site/contact-ticket/'.$ticketId.'?token=invalid')->assertNotFound();

        $this->getJson('/api/site/contact-ticket/'.$ticketId.'?token='.$ticketToken)
            ->assertOk()->assertJsonPath('ticket.id', $ticketId);

        $this->postJson('/api/site/contact-ticket/'.$ticketId.'/messages?token='.$ticketToken, [
            'message' => 'Another question',
        ])->assertCreated();
        $this->assertDatabaseCount('contact_chat_messages', 2);
        $this->assertDatabaseCount('admin_notifications', 2);
    }
}
