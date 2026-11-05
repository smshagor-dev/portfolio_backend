<?php

namespace App\Services;

use App\Models\AdminNotification;
use Illuminate\Support\Collection;

final class AdminNotificationGroups
{
    private static function subject(AdminNotification $entry): string
    {
        $body = trim((string) $entry->body);
        if (preg_match('/^Subject:\s*(.+)$/mi', $body, $matches)) {
            return trim($matches[1]);
        }
        return $body;
    }

    public static function groupId(AdminNotification $entry): string
    {
        $conversationId = (int) ($entry->conversationId ?: $entry->messageId);
        if ($conversationId > 0) {
            return 'conversation:'.$conversationId;
        }
        $fallback = json_encode([
            'email' => strtolower(trim((string) $entry->visitorEmail)),
            'subject' => strtolower(self::subject($entry)),
        ], JSON_UNESCAPED_UNICODE);
        return 'fallback:'.rtrim(strtr(base64_encode($fallback), '+/', '-_'), '=');
    }

    public static function fromRecords(iterable $notifications): Collection
    {
        $sorted = collect($notifications)->sortByDesc(
            fn ($record) => $record->createdAt?->getTimestamp() ?? 0
        );
        $groups = [];
        foreach ($sorted as $record) {
            $id = self::groupId($record);
            if (!isset($groups[$id])) {
                $conversationId = (int) ($record->conversationId ?: $record->messageId);
                $groups[$id] = [
                    'groupId' => $id,
                    'type' => $record->type === 'NEW_MESSAGE' ? 'MESSAGE' : 'REPLY',
                    'senderName' => (string) $record->visitorName,
                    'email' => (string) $record->visitorEmail,
                    'subject' => self::subject($record),
                    'messageCount' => 0,
                    'unreadCount' => 0,
                    'latestMessagePreview' => (string) $record->preview,
                    'latestCreatedAt' => $record->createdAt,
                    'conversationId' => $conversationId > 0 ? $conversationId : null,
                    'notificationIds' => [],
                    'actionUrl' => '/admin/messages?messageId='.$conversationId,
                ];
            }
            $groups[$id]['messageCount']++;
            $groups[$id]['unreadCount'] += $record->isRead ? 0 : 1;
            $groups[$id]['notificationIds'][] = (string) $record->id;
        }
        return collect(array_values($groups));
    }

    public static function all(): Collection
    {
        // Preserve grouped pagination semantics from the old Express API.
        return self::fromRecords(AdminNotification::orderByDesc('createdAt')->get());
    }

    public static function find(string $groupId): ?array
    {
        // Permit old notification IDs as well as the grouped Express API IDs
        // during rolling frontend/backend deployments.
        $single = AdminNotification::find($groupId);
        if ($single) {
            $groupId = self::groupId($single);
        }
        return self::all()->first(fn ($group) => $group['groupId'] === $groupId);
    }
}
