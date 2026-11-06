<?php

namespace Tests\Feature;

use App\Services\OpenAlexAbstractService;
use PHPUnit\Framework\TestCase;

class OpenAlexAbstractTest extends TestCase
{
    public function test_reconstructs_abstract_in_position_order(): void
    {
        $abstract = (new OpenAlexAbstractService())->reconstruct([
            'world' => [1], 'Hello' => [0], 'research' => [2],
        ]);
        $this->assertSame('Hello world research', $abstract);
    }
}
