<?php

namespace App\Http\Controllers\Api;

use App\Models\JobEmailDraft;
use App\Models\JobPost;
use App\Models\Profile;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;

class JobPdfController extends Controller
{
    public function generate(int $id): JsonResponse
    {
        $draft = JobEmailDraft::findOrFail($id);
        abort_if(in_array($draft->status, ['SENT', 'OPENED', 'CLICKED'], true), 409);
        $job = JobPost::findOrFail($draft->jobPostId);
        $profile = Profile::find(1);
        $letter = trim((string) ($draft->coverLetterText ?: $draft->body));
        abort_unless($letter, 422, 'Cover letter draft cannot be empty.');

        $name = e((string) ($profile?->name ?: 'Applicant'));
        $role = e((string) ($job->title ?: 'Position'));
        $company = e((string) ($job->company ?: 'Company'));
        $text = nl2br(e($letter));
        $html = '<!doctype html><html><head><meta charset="UTF-8"><style>'
            .'body{font-family:DejaVu Sans,sans-serif;font-size:11pt;color:#111;line-height:1.55;margin:42px}'
            .'h1{font-size:17pt;margin-bottom:4px}h2{font-size:12pt;font-weight:normal;margin-top:0;color:#333}'
            .'p{margin-top:25px;white-space:normal;overflow-wrap:break-word}'
            .'</style></head><body><h1>'.$name.'</h1><h2>'.$role.' at '.$company.'</h2><p>'.$text.'</p></body></html>';
        $bytes = Pdf::loadHTML($html)->setPaper('a4')->output();
        $filename = 'job-cover-letters/cover-letter-'.$draft->id.'.pdf';
        app(\App\Services\LegacyFtpStorage::class)->putPrivateBytes($filename, $bytes);
        $draft->forceFill([
            'coverLetterPdfUrl' => $filename,
        ])->save();
        return response()->json([
            'message' => 'Cover letter PDF generated privately.',
            'draftId' => $draft->id,
            'downloadUrl' => '/api/admin/job-agent/drafts/'.$draft->id.'/cover-letter-pdf',
        ]);
    }

    public function download(int $id)
    {
        $draft = JobEmailDraft::findOrFail($id);
        $path = (string) $draft->coverLetterPdfUrl;
        abort_unless(str_starts_with($path, 'job-cover-letters/') && app(\App\Services\LegacyFtpStorage::class)->privateDisk()->exists($path), 404);
        return app(\App\Services\LegacyFtpStorage::class)->privateDisk()->download($path, 'cover-letter-'.$draft->id.'.pdf', ['Content-Type' => 'application/pdf']);
    }
}
