<?php

namespace Tests\Feature;

use App\Models\AdminUser;
use App\Models\AiProvider;
use App\Models\AiSettings;
use App\Models\ContactChatMessage;
use App\Models\ContactMessage;
use App\Models\JobPost;
use App\Models\Profile;
use App\Models\ResearchComment;
use App\Models\ResearchPublication;
use App\Models\ResearchReply;
use App\Models\SiteSettings;
use Tests\TestCase;

class SchemaIntegrityTest extends TestCase
{
    public function test_collections_match_existing_prisma_mongodb_documents(): void
    {
        foreach ([
            AdminUser::class => 'AdminUser',
            AiProvider::class => 'ai_providers',
            AiSettings::class => 'ai_settings',
            Profile::class => 'Profile',
            SiteSettings::class => 'SiteSettings',
            ContactMessage::class => 'ContactMessage',
            ContactChatMessage::class => 'ContactChatMessage',
            ResearchPublication::class => 'research_publications',
            ResearchComment::class => 'researchcomment',
            ResearchReply::class => 'researchreply',
            JobPost::class => 'job_posts',
        ] as $model => $collection) {
            $this->assertSame($collection, (new $model())->getTable());
        }
    }

    public function test_prisma_numeric_keys_are_preserved(): void
    {
        foreach ([AdminUser::class, Profile::class, JobPost::class, ResearchPublication::class] as $model) {
            $this->assertSame('id', (new $model())->getKeyName());
            $this->assertFalse((new $model())->getIncrementing());
        }
    }
}
