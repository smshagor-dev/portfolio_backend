<?php

namespace App\Http\Controllers\Api;

use App\Models\AdminNotification;
use App\Models\AnalyticsDailyVisit;
use App\Models\AnalyticsSession;
use App\Models\Article;
use App\Models\ContactChatMessage;
use App\Models\ContactMessage;
use App\Services\ContactNotificationService;
use App\Services\LegacyFtpStorage;
use App\Models\JobEmailDraft;
use App\Models\Project;
use App\Models\ResearchPublication;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class AdminOperationsController extends Controller
{
    public function dashboard(): JsonResponse
    {
        $siteSettings = \App\Models\SiteSettings::find(1)?->toArray() ?? [];
        unset($siteSettings['smtpPass']);
        $data = [
            'profile' => \App\Models\Profile::find(1),
            'siteSettings' => $siteSettings,
            'serviceSection' => \App\Models\ServiceSection::find(1),
            'services' => Service::with('comments.replies')->orderBy('sortOrder')->get(),
            'statsCounters' => \App\Models\StatsCounter::orderBy('sortOrder')->get(),
            'achievements' => \App\Models\Achievement::orderBy('sortOrder')->get(),
            'skills' => \App\Models\Skill::orderBy('sortOrder')->get(),
            'experiences' => \App\Models\Experience::orderBy('sortOrder')->get(),
            'educations' => \App\Models\Education::orderBy('sortOrder')->get(),
            'projects' => Project::orderBy('sortOrder')->get(),
            'pricings' => \App\Models\Pricing::orderBy('sortOrder')->get(),
            'faqs' => \App\Models\Faq::orderBy('sortOrder')->get(),
            'testimonials' => \App\Models\Testimonial::orderBy('sortOrder')->get(),
            'messages' => ContactMessage::orderByDesc('createdAt')->limit(50)->get(),
        ];
        $data['dashboardSummary'] = [
            'projects' => count($data['projects']),
            'services' => count($data['services']),
            'articles' => Article::count(),
            'researchPublications' => ResearchPublication::count(),
            'messages' => count($data['messages']),
            'pendingMessages' => ContactMessage::where('status', 'not_solved')->count(),
        ];
        return response()->json($data);
    }

    public function messages(): JsonResponse
    {
        return response()->json([
            'messages' => ContactMessage::orderByDesc('createdAt')->paginate(50),
        ]);
    }

    public function message(int $messageId): JsonResponse
    {
        $ticket = ContactMessage::with('chatMessages')->findOrFail($messageId);
        return response()->json(['data' => $ticket]);
    }

    public function reply(Request $request, int $messageId, LegacyFtpStorage $ftp): JsonResponse
    {
        $input = $request->validate([
            'message' => ['required', 'string', 'max:20000'],
            'photo' => ['sometimes', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'file' => ['sometimes', 'file', 'mimes:pdf,txt,jpg,jpeg,png,webp', 'max:10240'],
        ]);
        $ticket = ContactMessage::findOrFail($messageId);
        abort_if($ticket->status === 'solved', 409, 'Ticket is closed.');
        $files = ['photo' => '', 'file' => ''];
        try {
            foreach (['photo', 'file'] as $field) {
                if ($request->hasFile($field)) {
                    $files[$field] = $ftp->uploadPublic($request->file($field), 'admin-chat-'.$field)['path'];
                }
            }
            $reply = ContactChatMessage::create([
                'contactMessageId' => $ticket->id, 'senderType' => 'admin',
                'senderName' => (string) $request->user()->name, 'message' => $input['message'],
                'photo' => $files['photo'], 'file' => $files['file'],
            ]);
        } catch (\Throwable $e) {
            foreach (array_filter($files) as $file) {
                try {
                    $ftp->deletePublic($file);
                } catch (\Throwable $cleanupError) {
                    logger()->warning('FTP reply cleanup failed', ['type' => get_class($cleanupError)]);
                }
            }
            throw $e;
        }
        app(ContactNotificationService::class)->onAdminReply($ticket);
        return response()->json(['message' => 'Reply saved.', 'data' => $reply], 201);
    }

    public function updateStatus(Request $request, int $messageId): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:solved,not_solved']]);
        $ticket = ContactMessage::findOrFail($messageId);
        $ticket->update($data);
        return response()->json(['message' => 'Ticket status updated.', 'data' => $ticket->fresh()]);
    }

    public function deleteMessage(int $messageId, LegacyFtpStorage $ftp): JsonResponse
    {
        $ticket = ContactMessage::with('chatMessages')->findOrFail($messageId);
        $paths = $ticket->chatMessages->flatMap(
            fn ($item) => [$item->photo, $item->file]
        )->merge([$ticket->photo, $ticket->file])
            ->filter(fn ($path) => is_string($path) && preg_match('~^/uploads/[a-zA-Z0-9._-]+$~D', $path))
            ->unique()->values()->all();
        // Database deletion and remote FTP are separate resources.
        DB::transaction(fn () => $ticket->delete());
        $failed = 0;
        foreach ($paths as $file) {
            try {
                $ftp->deletePublic($file);
            } catch (\Throwable $error) {
                $failed++;
                logger()->warning('FTP ticket file deletion failed', ['type' => get_class($error)]);
            }
        }
        return response()->json([
            'message' => $failed ? 'Ticket deleted; some remote files require manual cleanup.' : 'Ticket deleted.',
            'ftpDeletionFailures' => $failed,
        ]);
    }

    public function notifications(Request $request): JsonResponse
    {
        return response()->json(['notifications' => AdminNotification::orderByDesc('createdAt')->paginate(50)]);
    }

    public function unreadCount(): JsonResponse
    {
        return response()->json(['unreadCount' => AdminNotification::where('isRead', false)->count()]);
    }

    public function readAll(): JsonResponse
    {
        AdminNotification::where('isRead', false)->update(['isRead' => true]);
        return response()->json(['message' => 'Notifications marked as read.']);
    }

    public function readOne(string $id): JsonResponse
    {
        $entry = AdminNotification::findOrFail($id);
        $entry->update(['isRead' => true]);
        return response()->json(['message' => 'Notification read.', 'notification' => $entry]);
    }

    public function deleteNotification(string $id): JsonResponse
    {
        AdminNotification::findOrFail($id)->delete();
        return response()->json(['message' => 'Notification deleted.']);
    }

    public function analytics(): JsonResponse
    {
        $now = now();
        // Prisma stores visitDate as a BSON Date. SQL DATE()/GROUP BY
        // expressions do not work with the MongoDB query builder.
        $database = DB::connection('mongodb')->getClient()
            ->selectDatabase((string) config('database.connections.mongodb.database'));
        $rows = $database->selectCollection('AnalyticsDailyVisit')->aggregate([
            ['$match' => ['visitDate' => ['$gte' => new \MongoDB\BSON\UTCDateTime(
                $now->copy()->subDays(29)->startOfDay()->getTimestamp() * 1000
            )]]],
            ['$group' => [
                '_id' => ['$dateToString' => [
                    'format' => '%Y-%m-%d', 'date' => '$visitDate', 'timezone' => 'UTC',
                ]],
                'users' => ['$sum' => 1],
            ]],
            ['$sort' => ['_id' => 1]],
        ]);
        $growth = collect(iterator_to_array($rows, false))->map(
            fn ($row) => ['date' => (string) $row['_id'], 'users' => (int) $row['users']]
        );
        $visitors = AnalyticsSession::orderByDesc('lastSeenAt')->limit(20)->get()->map(
            fn ($row) => [
                'id' => $row->id, 'userId' => $row->sessionId,
                'country' => $row->country, 'region' => $row->region, 'city' => $row->city,
                'currentPage' => $row->lastPath, 'lastSeenAt' => $row->lastSeenAt,
                'isLive' => $row->lastSeenAt && $row->lastSeenAt->greaterThan(now()->subMinutes(5)),
            ]
        );
        return response()->json([
            'source' => 'internal', 'connected' => true,
            'activeUsers' => AnalyticsSession::where('lastSeenAt', '>=', now()->subMinutes(5))->count(),
            'todayUsers' => AnalyticsDailyVisit::where('visitDate', '>=', today('UTC')->startOfDay())
                ->where('visitDate', '<', today('UTC')->addDay()->startOfDay())->count(),
            'last7DaysUsers' => AnalyticsDailyVisit::where('visitDate', '>=', now()->subDays(7))->count(),
            'last30DaysUsers' => AnalyticsDailyVisit::where('visitDate', '>=', now()->subDays(30))->count(),
            'growth' => $growth, 'weekly' => $growth->take(-7)->values(),
            'visitors' => $visitors, 'fetchedAt' => $now->toIso8601String(),
        ]);
    }
}
