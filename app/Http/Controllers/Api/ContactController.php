<?php

namespace App\Http\Controllers\Api;

use App\Models\ContactChatMessage;
use App\Models\ContactMessage;
use App\Services\ContactNotificationService;
use App\Services\LegacyFtpStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ContactController extends Controller
{
    private function ticket(Request $request, int $id): ContactMessage
    {
        $token = (string) ($request->header('X-Ticket-Token') ?: $request->query('token', ''));
        abort_if(!$token || strlen($token) > 200, 404);
        $ticket = ContactMessage::findOrFail($id);
        abort_unless(hash_equals((string) $ticket->ticketToken, $token), 404);
        return $ticket;
    }

    private function files(Request $request, LegacyFtpStorage $ftp, string $prefix): array
    {
        $paths = ['photo' => '', 'file' => ''];
        try {
            foreach (['photo', 'file'] as $field) {
                if ($request->hasFile($field)) {
                    $uploaded = $ftp->uploadPublic(
                        $request->file($field),
                        $prefix.'-'.$field
                    );
                    $paths[$field] = $uploaded['path'];
                }
            }
            return $paths;
        } catch (\Throwable $e) {
            $this->discardFiles($ftp, $paths);
            throw $e;
        }
    }

    private function discardFiles(LegacyFtpStorage $ftp, array $files): void
    {
        foreach ($files as $path) {
            if (!$path) continue;
            try {
                $ftp->deletePublic($path);
            } catch (\Throwable $error) {
                logger()->warning('FTP orphan cleanup failed', ['type' => get_class($error)]);
            }
        }
    }

    public function create(Request $request, LegacyFtpStorage $ftp): JsonResponse
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'email' => ['required', 'email', 'max:191'],
            'subject' => ['required', 'string', 'max:191'],
            'message' => ['required', 'string', 'max:20000'],
            'photo' => ['sometimes', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'file' => ['sometimes', 'file', 'mimes:pdf,txt,jpg,jpeg,png,webp', 'max:10240'],
        ]);
        $files = $this->files($request, $ftp, 'contact');
        try {
            $ticket = DB::transaction(function () use ($input, $files) {
                $saved = ContactMessage::create([
                    'name' => $input['name'], 'email' => strtolower($input['email']),
                    'subject' => $input['subject'], 'message' => $input['message'],
                    'ticketToken' => bin2hex(random_bytes(32)), 'status' => 'not_solved',
                    'photo' => $files['photo'], 'file' => $files['file'],
                ]);
                ContactChatMessage::create([
                    'contactMessageId' => $saved->id,
                    'senderType' => 'visitor', 'senderName' => $input['name'],
                    'message' => $input['message'], 'photo' => $files['photo'], 'file' => $files['file'],
                ]);
                return $saved;
            });
        } catch (\Throwable $e) {
            $this->discardFiles($ftp, $files);
            throw $e;
        }
        app(ContactNotificationService::class)->onCreated($ticket);
        return response()->json([
            'message' => 'Contact ticket created.',
            'ticket' => $ticket->load('chatMessages'),
            'ticketToken' => $ticket->ticketToken,
        ], 201);
    }

    public function show(Request $request, int $messageId): JsonResponse
    {
        return response()->json(['ticket' => $this->ticket($request, $messageId)->load('chatMessages')]);
    }

    public function reply(Request $request, int $messageId, LegacyFtpStorage $ftp): JsonResponse
    {
        $ticket = $this->ticket($request, $messageId);
        abort_if($ticket->status === 'solved', 409);
        $data = $request->validate([
            'message' => ['nullable', 'string', 'max:20000'],
            'photo' => ['sometimes', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'file' => ['sometimes', 'file', 'mimes:pdf,txt,jpg,jpeg,png,webp', 'max:10240'],
        ]);
        abort_if(empty($data['message']) && !$request->hasFile('photo') && !$request->hasFile('file'), 422);
        $files = $this->files($request, $ftp, 'chat');
        try {
            $chatMessage = ContactChatMessage::create([
                'contactMessageId' => $ticket->id,
                'senderType' => 'visitor', 'senderName' => $ticket->name,
                'message' => (string) ($data['message'] ?? ''),
                'photo' => $files['photo'], 'file' => $files['file'],
            ]);
        } catch (\Throwable $e) {
            $this->discardFiles($ftp, $files);
            throw $e;
        }
        app(ContactNotificationService::class)->onVisitorReply($ticket, (string) ($data['message'] ?? ''));
        return response()->json(['message' => 'Reply created.', 'chatMessage' => $chatMessage], 201);
    }

    public function download(Request $request, int $messageId, int $chatId, string $field, LegacyFtpStorage $ftp)
    {
        abort_unless(in_array($field, ['photo', 'file'], true), 404);
        $ticket = $this->ticket($request, $messageId);
        $message = $ticket->chatMessages()->findOrFail($chatId);
        $path = (string) $message->{$field};
        // Restrict the download to a file already bound to this ticket.
        abort_unless(preg_match('~^/uploads/[a-zA-Z0-9._-]+$~D', $path), 404);
        $key = ltrim($path, '/');
        abort_unless($ftp->publicDisk()->exists($key), 404);
        return $ftp->publicDisk()->download($key);
    }
}
