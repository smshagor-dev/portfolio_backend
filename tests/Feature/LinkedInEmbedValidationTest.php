<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\LinkedInPostsController;
use PHPUnit\Framework\TestCase;

class LinkedInEmbedValidationTest extends TestCase
{
    public function test_embedded_linkedin_post_is_allowed(): void
    {
        $url = 'https://www.linkedin.com/embed/feed/update/urn:li:share:7502991980113838081?collapsed=1';
        $this->assertSame($url, LinkedInPostsController::normalizeEmbed($url));
    }

    public function test_untrusted_iframe_src_is_rejected(): void
    {
        $this->assertNull(LinkedInPostsController::normalizeEmbed(
            '<iframe src="https://linkedin.com.attacker.example/embed/feed/update/urn:li:share:123"></iframe>'
        ));
        $this->assertNull(LinkedInPostsController::normalizeEmbed('javascript:alert(1)'));
    }
}
