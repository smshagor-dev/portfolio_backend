<?php

namespace App\Http\Controllers\Api;

use App\Models\ContactChatMessage;
use App\Models\ContactMessage;
use App\Services\ContactNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ContactController extends Controller
{
    private function ticket(Request $request, int $id): ContactMessage
    {
        $token = (string) $request->query('token', '');
        abort_if(!$token || strlen($token) > 200, 404);
        $ticket = ContactMessage::findOrFail($id);
        abort_unless(hash_equals($ticket->ticketToken, $token), 404);
        return $ticket;
    }

    private function files(Request $request): array
    {
        return [
            'photo' => $request->hasFile('photo') ? $request->file('photo')->store('contacts', 'local') : '',
            'file' => $request->hasFile('file') ? $request->file('file')->store('contacts', 'local') : '',
        ];
    }

    public function create(Request $request): JsonResponse
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'max:191'],
            'email' => ['required', 'email', 'max:191'],
            'subject' => ['required', 'string', 'max:191'],
            'message' => ['required', 'string', 'max:20000'],
            'photo' => ['sometimes', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'file' => ['sometimes', 'file', 'mimes:pdf,txt,jpg,jpeg,png,webp', 'max:10240'],
        ]);
        $files = $this->files($request);
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

    public function reply(Request $request, int $messageId): JsonResponse
    {
        $ticket = $this->ticket($request, $messageId);
        abort_if($ticket->status === 'solved', 409);
        $data = $request->validate([
            'message' => ['nullable', 'string', 'max:20000'],
            'photo' => ['sometimes', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'file' => ['sometimes', 'file', 'mimes:pdf,txt,jpg,jpeg,png,webp', 'max:10240'],
        ]);
        abort_if(empty($data['message']) && !$request->hasFile('photo') && !$request->hasFile('file'), 422);
        $files = $this->files($request);
        $chatMessage = ContactChatMessage::create([
            'contactMessageId' => $ticket->id,
            'senderType' => 'visitor', 'senderName' => $ticket->name,
            'message' => (string) ($data['message'] ?? ''),
            'photo' => $files['photo'], 'file' => $files['file'],
        ]);
        app(ContactNotificationService::class)->onVisitorReply($ticket, (string) ($data['message'] ?? ''));
        return response()->json(['message' => 'Reply created.', 'chatMessage' => $chatMessage], 201);
    }

    public function download(Request $request, int $messageId, int $chatId, string $field)
    {
        abort_unless(in_array($field, ['photo', 'file'], true), 404);
        $ticket = $this->ticket($request, $messageId);
        $message = $ticket->chatMessages()->findOrFail($chatId);
        $path = $message->{$field};
        abort_unless($path && str_starts_with($path, 'contacts/') && Storage::disk('local')->exists($path), 404);
        return Storage::disk('local')->download($path);
    }
}
