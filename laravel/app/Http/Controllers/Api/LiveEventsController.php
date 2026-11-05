<?php

namespace App\Http\Controllers\Api;

use App\Models\AdminNotification;
use App\Models\ContactChatMessage;
use App\Models\ContactMessage;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LiveEventsController extends Controller
{
    private function stream(callable $callback): StreamedResponse
    {
        return response()->stream($callback, 200, [
            'Content-Type' => 'text/event-stream; charset=utf-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function emit(string $event, string $id, array $payload): void
    {
        $json = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        echo 'id: '.$id."\n";
        echo 'event: '.$event."\n";
        echo 'data: '.$json."\n\n";
        if (ob_get_level() > 0) {
            @ob_flush();
        }
        flush();
    }

    private function keepAlive(): void
    {
        echo ": heartbeat\n\n";
        if (ob_get_level() > 0) {
            @ob_flush();
        }
        flush();
    }

    public function admin(Request $request): StreamedResponse
    {
        $lastId = (string) ($request->header('Last-Event-ID') ?: $request->query('lastEventId', ''));
        $lastId = preg_match('/^[a-f0-9-]{36}$/iD', $lastId) ? $lastId : '';
        $previous = $lastId ? AdminNotification::find($lastId) : null;
        $since = $previous?->createdAt ?? now()->startOfSecond();

        return $this->stream(function () use ($since, $lastId): void {
            $started = microtime(true);
            $cursorTime = $since;
            $cursorId = $lastId;
            $this->keepAlive();
            while (!connection_aborted() && microtime(true) - $started < 20) {
                $events = AdminNotification::query()
                    ->where(function ($query) use ($cursorTime, $cursorId): void {
                        $query->where('createdAt', '>', $cursorTime);
                        if ($cursorId !== '') {
                            $query->orWhere(function ($q) use ($cursorTime, $cursorId): void {
                                $q->where('createdAt', '=', $cursorTime)->where('id', '>', $cursorId);
                            });
                        } else {
                            $query->orWhere('createdAt', '=', $cursorTime);
                        }
                    })->orderBy('createdAt')->orderBy('id')->limit(50)->get();

                foreach ($events as $event) {
                    $this->emit('admin:notification', (string) $event->id, [
                        'id' => $event->id, 'type' => $event->type,
                        'title' => $event->title, 'body' => $event->body,
                        'messageId' => $event->messageId,
                        'isRead' => $event->isRead,
                        'createdAt' => $event->createdAt?->toIso8601String(),
                    ]);
                    $cursorTime = $event->createdAt;
                    $cursorId = (string) $event->id;
                }
                usleep(1000000);
                $this->keepAlive();
            }
        });
    }

    public function ticket(Request $request, int $messageId): StreamedResponse
    {
        // Token in custom header is preferred: it avoids URL, history and access-log leakage.
        $token = (string) ($request->header('X-Ticket-Token') ?: $request->query('token', ''));
        abort_unless($token && strlen($token) <= 200, 404);
        $ticket = ContactMessage::findOrFail($messageId);
        abort_unless(hash_equals((string) $ticket->ticketToken, $token), 404);

        $cursor = filter_var($request->header('Last-Event-ID') ?: $request->query('lastEventId'), FILTER_VALIDATE_INT);
        $cursor = $cursor && $cursor > 0 ? $cursor : 0;

        return $this->stream(function () use ($ticket, $cursor): void {
            $started = microtime(true);
            $lastMessageId = $cursor;
            $this->keepAlive();
            while (!connection_aborted() && microtime(true) - $started < 20) {
                $messages = ContactChatMessage::where('contactMessageId', $ticket->id)
                    ->where('id', '>', $lastMessageId)->orderBy('id')->limit(50)->get();
                foreach ($messages as $message) {
                    $this->emit('ticket:message', (string) $message->id, [
                        'id' => $message->id,
                        'contactMessageId' => $ticket->id,
                        'senderType' => $message->senderType,
                        'senderName' => $message->senderName,
                        'message' => $message->message,
                        'createdAt' => $message->createdAt?->toIso8601String(),
                    ]);
                    $lastMessageId = $message->id;
                }
                usleep(1000000);
                $this->keepAlive();
            }
        });
    }
}
