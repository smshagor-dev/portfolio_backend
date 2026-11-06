# Frontend & admin FTP upload API (AJAX)

The frontend and admin web app send multipart POST requests to Laravel. Laravel
validates the user/fields and uploads immediately to the old Express FTP host.
No FTP cron is used or required. FTP host/user/password remain server-side.

Backend routes (all return relative path and publicUrl on successful public upload):

| Screen | Route | FormData file key | Auth |
|---|---|---|---|
| Admin image | POST /api/admin/upload-image | image | Bearer admin |
| Admin resume | POST /api/admin/upload-resume | resume | Bearer admin |
| Admin verification | POST /api/admin/upload-verification-file | verificationFile | Bearer admin |
| Front service | POST /api/site/services/upload-image | image | Public, rate limited |
| Front testimonial | POST /api/site/testimonials/upload-image | image | Public, rate limited |
| Front contact | POST /api/site/contact | photo, file plus name/email/subject/message | Public, rate limited |
| Contact reply | POST /api/site/contact-ticket/{messageId}/messages | photo or file and message | Ticket token |
| Admin contact reply | POST /api/admin/messages/{messageId}/reply | photo or file and message | Bearer admin |
| Job Agent private CV | POST /api/admin/job-agent/profile-context/cv | cv | Bearer admin |

## AJAX example

    const data = new FormData();
    data.append('image', selectedFile);

    const response = await fetch(API_BASE_URL + '/api/admin/upload-image', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: data,
    });
    if (!response.ok) throw new Error('FTP upload failed');
    const { path, publicUrl } = await response.json();

Do not set multipart Content-Type by hand. The browser supplies its boundary.
Public uploads omit Authorization. Save the relative /uploads/... path in
MongoDB-backed CMS fields; render the absolute publicUrl as a preview.

Laravel uploads via FTP (server side), then returns HTTP 201 JSON. For image/PDF
display, the browser fetches publicUrl directly from the existing asset web
host. Laravel does NOT reverse proxy public media. FTP credentials are never
sent to the browser. An FTP failure returns HTTP 503 without local fallback;
the frontend must show an upload error and must not save a broken URL.

## Cron vs AJAX

FTP uploads: AJAX / HTTP multipart (immediate), no cron job.
Research metadata sync: optional twice-daily scheduler, disabled unless
RESEARCH_SYNC_ENABLED=true.
Job API source sync: optional six-hour scheduler, disabled unless
JOB_SOURCE_SYNC_ENABLED=true.

Even if enabled, these optional synchronizations will not run until an
operator adds an external server cron to invoke Laravel schedule:run each
minute. No FTP scheduler has been installed in the repository.

## Staging verification

1. Check CLI and web PHP-FPM have ext-ftp and ext-mongodb, and install
   Composer package league/flysystem-ftp.
2. Configure the same UPLOAD_STORAGE_* environment values as the old backend.
3. Run php artisan portfolio:preflight --check-ftp.
4. Test Admin upload and Public upload. Confirm HTTP 201, the /uploads/ path,
   and the actual file on the legacy FTP/public media server.
5. Disable FTP temporarily on staging to confirm HTTP 503, no local fallback.
6. Confirm existing frontend and admin clients call the new Laravel API base.
   Their source repositories have not been modified as part of this change.
