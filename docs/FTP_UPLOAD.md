# FTP-based uploads (same keys as previous Express uploader)

Set these only in your server's private .env; never commit credentials.
The Laravel FTP adapter uses the official league/flysystem-ftp ^3.0 package and
requires PHP ext-ftp enabled in both CLI and web/FPM.

UPLOAD_STORAGE_DRIVER=ftp
FILESYSTEM_DISK=ftp_public
UPLOAD_STORAGE_PUBLIC_BASE_URL=https://your-legacy-asset-domain.example
UPLOAD_STORAGE_FTP_HOST=your.ftp.host.example
UPLOAD_STORAGE_FTP_PORT=21
UPLOAD_STORAGE_FTP_USER=your-ftp-user
UPLOAD_STORAGE_FTP_PASSWORD=your-password
UPLOAD_STORAGE_FTP_SECURE=true
UPLOAD_STORAGE_FTP_BASE_DIR=public_html

These values directly mirror the former Express backend's UPLOAD_STORAGE_* keys.
If BASE_DIR is already the FTP account's public web root, leave it empty.
The relative path /uploads/abc.jpg is saved on the remote FTP server at
BASE_DIR/uploads/abc.jpg. The returned publicUrl uses the origin of
UPLOAD_STORAGE_PUBLIC_BASE_URL; it never points to the Laravel API host.

IMPORTANT: new public uploads NEVER go into public or Laravel storage.
If FTP is not configured/accessible, uploads fail with HTTP 503. There is no
local fallback and no silent success.

For non-public Job Agent CVs and cover-letter PDFs, configure
UPLOAD_STORAGE_FTP_PRIVATE_BASE_DIR pointing to an actual private folder
outside BASE_DIR / the FTP-served public website. Until it is configured,
private CV/PDF operations return 503. Do not put confidential CVs in public_html.

The former Express backend supported TLS_SERVERNAME and ALLOW_INVALID_CERT.
Flysystem's PHP FTP adapter does not implement the old Node TLS option mapping.
Use a valid FTPS certificate; do not rely on ALLOW_INVALID_CERT=true. Test on
your staging host before a production change.

After updating composer.json (locally on a machine with ext-ftp enabled):

    composer update league/flysystem-ftp --with-all-dependencies
    composer show league/flysystem-ftp
    php -m | grep -i ftp

Windows PowerShell: php -m | Select-String ftp

If deploying vendor/ from Windows to Linux, include the compatible vendor
directory and composer.lock, but verify the server's PHP ext-ftp, ext-mongodb,
and FPM module configuration independently. FTP network access must be permitted
by the hosting firewall.

FTP health is not proven by the MongoDB /api/health endpoint. Upload a test
image through the authenticated admin upload endpoint on a staging instance
and verify /uploads/... on the existing asset host before cutover.

Legacy contact attachments are stored on public FTP exactly as before.
This means their URLs may be publicly retrievable without a ticket token:
do not treat FTP public uploads as private storage.
