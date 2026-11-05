<?php

namespace Tests\Feature;

use App\Services\ResearchSyncService;
use App\Models\ResearchPublication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ResearchSyncParsingTest extends TestCase
{
    use RefreshDatabase;

    public function test_orcid_nested_journal_metadata_is_parsed(): void
    {
        config()->set('research.enabled', true);
        config()->set('research.orcid_id', '0000-0002-1825-0097');
        config()->set('research.author_name', '');
        Http::fake([
            'https://pub.orcid.org/*' => Http::response(['group' => [[
                'work-summary' => [[
                    'title' => ['title' => ['value' => 'A Reproducible Software Study']],
                    'journal-title' => ['value' => 'Example Journal'],
                    'publication-date' => [
                        'year' => ['value' => '2025'],
                        'month' => ['value' => '03'],
                        'day' => ['value' => '12'],
                    ],
                    'publication-type' => 'journal-article',
                    'external-ids' => ['external-id' => []],
                ]],
            ]]], 200),
        ]);
        $result = app(ResearchSyncService::class)->sync();

        $this->assertSame(1, $result['created']);
        $this->assertDatabaseHas('research_publications', [
            'title' => 'A Reproducible Software Study',
            'publisherName' => 'Example Journal',
            'status' => 'published',
        ]);
        $this->assertSame(1, ResearchPublication::count());
    }
}
