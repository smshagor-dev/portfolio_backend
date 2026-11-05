<?php

namespace Tests\Feature;

use App\Models\AiSettings;
use App\Models\JobAgentSettings;
use App\Models\JobMatch;
use App\Models\SiteSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SchemaIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_mysql_domain_table_names_are_consistent_with_eloquent_models(): void
    {
        $expected = [
            AiSettings::class => 'ai_settings',
            SiteSettings::class => 'site_settings',
            JobMatch::class => 'job_matches',
            JobAgentSettings::class => 'job_agent_settings',
        ];

        foreach ($expected as $model => $table) {
            $this->assertSame($table, (new $model())->getTable());
            $this->assertTrue(Schema::hasTable($table), $table.' must be migrated');
        }
    }

    public function test_admin_and_portfolio_relational_tables_exist(): void
    {
        foreach ([
            'admin_users', 'personal_access_tokens', 'profiles',
            'projects', 'project_comments', 'articles', 'article_comments',
            'research_publications', 'research_comments', 'contact_messages',
            'contact_chat_messages', 'job_posts', 'job_email_drafts',
        ] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table.' missing');
        }
    }
}
