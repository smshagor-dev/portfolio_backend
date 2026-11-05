<?php

namespace Tests\Feature;

use App\Models\AdminNotification;
use App\Services\AdminNotificationGroups;
use PHPUnit\Framework\TestCase;

class AdminNotificationGroupsTest extends TestCase
{
    public function test_multiple_notifications_from_one_ticket_form_one_group(): void
    {
        $new = new AdminNotification();
        $new->forceFill([
            'id' => 'n1', 'type' => 'NEW_MESSAGE',
            'conversationId' => 7, 'messageId' => 7,
            'visitorName' => 'Visitor', 'visitorEmail' => 'visitor@example.test',
            'body' => 'Subject: Partnership', 'preview' => 'First',
            'isRead' => true, 'createdAt' => now()->subMinute(),
        ]);
        $reply = new AdminNotification();
        $reply->forceFill([
            'id' => 'n2', 'type' => 'MESSAGE_REPLY',
            'conversationId' => 7, 'messageId' => 7,
            'visitorName' => 'Visitor', 'visitorEmail' => 'visitor@example.test',
            'body' => 'Subject: Partnership', 'preview' => 'Second',
            'isRead' => false, 'createdAt' => now(),
        ]);
        $groups = AdminNotificationGroups::fromRecords([$new, $reply]);
        $this->assertCount(1, $groups);
        $item = $groups->first();
        $this->assertSame('conversation:7', $item['groupId']);
        $this->assertSame('REPLY', $item['type']);
        $this->assertSame(2, $item['messageCount']);
        $this->assertSame(1, $item['unreadCount']);
        $this->assertSame(['n2', 'n1'], $item['notificationIds']);
    }
}
