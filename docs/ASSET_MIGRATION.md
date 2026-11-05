# Public media retained during Express removal

The legacy Git-tracked public/uploads/ assets (public PDFs, photos, screenshots and other media) and public/research/ static resources are retained in the new Laravel public/ directory with the SAME URL paths.

No Node/Express service is needed to serve these assets and there is no longer a separate old public/ directory. The old legacy asset import command is removed because the tracked media is already copied.

The previous SQL upload and founder README are excluded from the live uploads tree. The two founder WebP screenshots are retained. The built-in web server and public/.htaccess reject execution of active-content upload extensions; nginx rules in docker/nginx.conf provide an equivalent guard.

Live FTP storage is separate: uploaded media that exists only on a remote FTP server is NOT automatically present in the repository. Preserve that storage and check the public URL after switching the API. Do not delete untracked FTP or private storage data when cleaning up old code.
