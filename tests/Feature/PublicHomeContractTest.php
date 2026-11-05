<?php

namespace Tests\Feature;

use App\Models\Profile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicHomeContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_home_has_original_response_sections(): void
    {
        $profile = new Profile();
        $profile->id = 1;
        $profile->forceFill([
            'name' => 'Portfolio Tester', 'profile' => 'Developer',
            'designation' => 'Full Stack Developer', 'description' => '',
            'email' => 'tester@example.test', 'phone' => '',
            'address' => '', 'github' => '', 'facebook' => '',
            'linkedIn' => '', 'twitter' => '', 'stackOverflow' => '',
            'leetcode' => '', 'socialLinks' => [], 'devUsername' => '',
            'resume' => '', 'heroSkills' => [],
        ])->save();

        $this->getJson('/api/site/home')
            ->assertOk()
            ->assertJsonStructure([
                'profile' => ['id', 'name'],
                'siteSettings', 'serviceSection', 'services',
                'statsCounters', 'achievements', 'skills', 'experiences',
                'projects', 'educations', 'pricings', 'faqs',
                'testimonials', 'blogs', 'articles', 'emergencyContacts',
            ])
            ->assertJsonPath('profile.name', 'Portfolio Tester');
    }
}
