<?php

namespace App\Services;

use App\Models\Experience;
use App\Models\JobMatch;
use App\Models\JobPost;
use App\Models\Project;
use App\Models\Skill;
use Illuminate\Support\Str;

class JobMatchService
{
    public function evaluate(JobPost $job): JobMatch
    {
        $skills = Skill::orderBy('sortOrder')->limit(200)->pluck('name')
            ->map(fn ($value) => trim(mb_strtolower((string) $value)))
            ->filter(fn ($value) => mb_strlen($value) >= 2)->unique()->values();
        $jobText = mb_strtolower(strip_tags((string) $job->description.' '.$job->title));
        $matched = $skills->filter(fn ($skill) => preg_match('/(?<![\pL\pN])'.preg_quote($skill, '/').'(?![\pL\pN])/ui', $jobText))->values();
        $total = max(1, $skills->count());
        $score = max(0, min(100, (int) round($matched->count() / $total * 100)));
        $description = $matched->isEmpty()
            ? 'No explicit overlap was found among saved portfolio skill labels; review manually.'
            : 'Matched portfolio skills: '.$matched->implode(', ').'.';
        $existing = JobMatch::where('jobPostId', $job->id)->whereNull('cvProfileId')->first();
        $record = $existing ?? new JobMatch();
        $record->fill([
            'jobPostId' => $job->id, 'cvProfileId' => null,
            'score' => $score,
            'matchedSkills' => $matched->all(),
            'missingSkills' => [],
            'summary' => $description.' This is a simple keyword overlap, not an AI or recruiter assessment.',
            'aiAnalysis' => [
                'method' => 'explicit-portfolio-skill-keyword-overlap',
                'skillsConsidered' => $total, 'notAnAiScore' => true,
            ],
            'coverLetter' => '',
        ])->save();
        return $record->fresh();
    }
}
