<?php

namespace Tests\Feature;

use App\Models\AdminUser;
use App\Models\ContactChatMessage;
use App\Models\ContactMessage;
use App\Models\ResearchPublication;
use App\Models\PersonalAccessToken;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class IsolatedMongoIntegrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Fail closed against production data and wrong CI configuration.
        if (!app()->environment('testing') ||
            config('database.default') !== 'mongodb' ||
            config('database.connections.mongodb.database') !== 'portfolio_ci') {
            $this->markTestSkipped('Requires ephemeral portfolio_ci MongoDB testing database.');
        }
    }

    public function test_legacy_prisma_research_bson_fields_are_read_by_laravel_and_public_api(): void
    {
        $db = DB::connection('mongodb')->getClient()->selectDatabase('portfolio_ci');
        $collection = $db->selectCollection('research_publications');
        $slug = 'ci-parity-paper-99981001';
        $collection->deleteMany(['slug' => $slug]);
        $collection->insertOne([
            '_id' => 99981001,
            'title' => 'CI Mongo Research',
            'slug' => $slug,
            'short_summary' => 'Original Prisma field',
            'publication_type' => 'journal-article',
            'research_area' => 'AI',
            'publisher_name' => 'CI Test Publisher',
            'published_date' => new \MongoDB\BSON\UTCDateTime(strtotime('2026-01-01 UTC') * 1000),
            'publication_url' => 'https://doi.org/10.0000/ci',
            'is_featured' => true,
            'status' => 'published',
            'views' => 0,
            'impression_count' => 0,
            'share_count' => 0,
        ]);
        try {
            $model = ResearchPublication::where('slug', $slug)->firstOrFail();
            $this->assertSame('Original Prisma field', $model->shortSummary);
            $this->assertTrue($model->isFeatured);
            $this->assertSame('Original Prisma field', $model->toArray()['shortSummary']);
            $this->getJson('/api/research-publications/'.$slug)
                ->assertOk()
                ->assertJsonPath('data.shortSummary', 'Original Prisma field');
        } finally {
            $collection->deleteMany(['slug' => $slug]);
        }
    }

    public function test_sanctum_admin_token_roundtrip_against_isolated_mongodb(): void
    {
        $admin = new AdminUser();
        $admin->id = 99981002;
        $admin->forceFill([
            'name' => 'CI Admin', 'email' => 'ci-only-parity@example.test',
            'passwordHash' => Hash::make('TestPassword-123!'),
            'twoFactorEnabled' => false,
        ])->save();

        try {
            $response = $this->postJson('/api/admin/login', [
                'email' => 'ci-only-parity@example.test',
                'password' => 'TestPassword-123!',
                'twoFactorCode' => '',
            ])->assertOk()->assertJsonStructure(['token', 'admin' => ['email']]);
            $token = (string) $response->json('token');
            // Pinpoint token parsing vs polymorphic owner resolution; never
            // print the sensitive token or credential in test logs.
            [$claimedId, $plainSecret] = explode('|', $token, 2);
            $hashedToken = hash('sha256', $plainSecret);
            $rawToken = DB::connection('mongodb')->getClient()
                ->selectDatabase('portfolio_ci')
                ->selectCollection('personal_access_tokens')
                ->findOne(['token' => $hashedToken]);
            $this->assertNotNull($rawToken, 'Sanctum token SHA-256 hash missing from MongoDB document.');
            $this->assertSame((string) $rawToken['_id'], $claimedId, 'Sanctum token prefix differs from BSON _id.');
            $byHash = PersonalAccessToken::query()->where('token', $hashedToken)->first();
            $this->assertNotNull($byHash, 'Sanctum token exists in BSON but model hash lookup failed.');
            $stored = PersonalAccessToken::findToken($token);
            $this->assertNotNull($stored, 'Sanctum token hash/ID lookup failed.');
            $this->assertInstanceOf(AdminUser::class, $stored->tokenable, 'Sanctum token owner failed to resolve.');
            $this->withToken($token)->getJson('/api/admin/me')
                ->assertOk()
                ->assertJsonPath('admin.email', 'ci-only-parity@example.test');
        } finally {
            $admin->tokens()->delete();
            $admin->delete();
        }
    }

    public function test_contact_ticket_timestamps_are_persisted_and_chat_relation_works(): void
    {
        $ticket = ContactMessage::create([
            'name' => 'CI Visitor',
            'email' => 'ci-visitor@example.test',
            'subject' => 'Test',
            'message' => 'Integration test only',
            'ticketToken' => bin2hex(random_bytes(32)),
            'status' => 'not_solved',
            'photo' => '', 'file' => '',
        ]);
        try {
            $reply = ContactChatMessage::create([
                'contactMessageId' => $ticket->id,
                'senderType' => 'visitor',
                'senderName' => 'CI Visitor',
                'message' => 'Hello', 'photo' => '', 'file' => '',
            ]);
            try {
                $this->assertNotNull($ticket->fresh()->createdAt);
                $this->assertNotNull($reply->fresh()->createdAt);
                $this->assertCount(1, $ticket->fresh()->chatMessages);
            } finally {
                $reply->delete();
            }
        } finally {
            $ticket->delete();
        }
    }
}
