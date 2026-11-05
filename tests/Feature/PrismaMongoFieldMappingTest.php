<?php

namespace Tests\Feature;

use App\Models\AiProvider;
use App\Models\AiSettings;
use App\Models\AiTrainingEntry;
use App\Models\ResearchComment;
use App\Models\ResearchPublication;
use App\Models\ResearchReply;
use Tests\TestCase;

class PrismaMongoFieldMappingTest extends TestCase
{
    public function test_research_model_maps_original_bson_keys_but_keeps_json_contract(): void
    {
        $paper = new ResearchPublication();
        $paper->fill([
            'title' => 'Mapping test',
            'shortSummary' => 'Abstract',
            'publicationType' => 'journal-article',
            'isFeatured' => true,
        ]);
        $this->assertSame('Abstract', $paper->getAttributes()['short_summary']);
        $this->assertSame('journal-article', $paper->getAttributes()['publication_type']);
        $this->assertTrue((bool) $paper->isFeatured);
        $this->assertSame('Abstract', $paper->attributesToArray()['shortSummary']);
        $this->assertArrayNotHasKey('short_summary', $paper->attributesToArray());
    }

    public function test_research_relationships_use_physical_foreign_keys(): void
    {
        $this->assertSame('publication_id', (new ResearchPublication())->comments()->getForeignKeyName());
        $this->assertSame('comment_id', (new ResearchComment())->replies()->getForeignKeyName());
        $comment = new ResearchComment();
        $comment->publicationId = 33;
        $this->assertSame(33, $comment->getAttributes()['publication_id']);
        $reply = new ResearchReply();
        $reply->commentId = 55;
        $this->assertSame(55, $reply->getAttributes()['comment_id']);
    }

    public function test_ai_provider_keys_stay_hidden_and_aliased(): void
    {
        $provider = new AiProvider();
        $provider->forceFill(['name' => 'openai', 'apiKey' => 'secret-never-expose', 'isActive' => true]);
        $this->assertSame('secret-never-expose', $provider->apiKey);
        $this->assertSame('secret-never-expose', $provider->getAttributes()['api_key']);
        $this->assertArrayNotHasKey('apiKey', $provider->attributesToArray());
        $this->assertArrayNotHasKey('api_key', $provider->attributesToArray());

        $settings = new AiSettings();
        $settings->fill(['activeProvider' => 'openai', 'modelName' => 'gpt-test']);
        $this->assertSame('openai', $settings->getAttributes()['active_provider']);

        $training = new AiTrainingEntry();
        $training->fill(['question' => 'Q', 'answer' => 'A', 'isActive' => true]);
        $this->assertArrayHasKey('is_active', $training->getAttributes());
    }
}
