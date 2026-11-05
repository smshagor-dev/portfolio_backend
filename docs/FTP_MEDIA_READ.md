# Serve old FTP assets through Laravel without local uploads

The original MongoDB profile and content records hold paths such as /uploads/photo.png.
After the Laravel migration, the app server returns 404 for those paths because
the old files reside on remote FTP, not in laravel/public/uploads.

The new GET /uploads/{filename} route reads public files from the configured
ftp_public disk and streams them to the browser with restricted MIME types.
It does not copy them to local storage. It only permits simple filenames
from /uploads and refuses executable files and traversal.

Public delivery path:
  smshagor.com/uploads/photo.png
  -> Next.js existing /uploads rewrite to smshagor.online/uploads/photo.png
  -> Laravel FtpPublicMediaController -> remote ftp_public disk.

Images on legacy FTP must physically exist under the FTP public root, at
FTP_BASE_DIR/uploads/photo.png. Their existence can be verified read-only:

    php artisan portfolio:preflight --check-ftp
    php artisan tinker --execute='dump(Storage::disk("ftp_public")->exists("uploads/YOUR_EXISTING_IMAGE.png"));'

If FTP reports false, check the previous Express UPLOAD_STORAGE_FTP_BASE_DIR,
the FTP login initial directory and whether old files were migrated. This
route cannot fabricate files that are not on the configured FTP account.

If FTP preflight fails, verify ext-ftp, league/flysystem-ftp, FTPS mode and
credentials (do not paste secrets into chat). Remember frontend GET delivery
and new authenticated POST upload are separate tests.

A dedicated public asset host still provides better CDN/caching performance
than proxying image bytes through PHP. Next.js can optionally rewrite
/uploads/* directly to the old FTP HTTP host once verified.

This route is public: never put private CVs, credentials or sensitive contact
documents in its ftp_public root. Job Agent private files use ftp_private.
