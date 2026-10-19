# OpenMind product case-study screenshots

These two product images are served by the portfolio backend at **`/uploads/founder/`**. They are read-only, version-controlled assets, separate from user-managed uploads and database content.

| Product | Public URL path | Source |
| --- | --- | --- |
| OpenMindAI | `/uploads/founder/openmindai-desktop.webp` | Founder-supplied OpenMindAI desktop screenshot |
| OpenMind Studio | `/uploads/founder/openmind-studio-desktop.webp` | Founder-supplied OpenMind Studio *concept visualization* |

The WebP images preserve the original composition but were previously resized to 640px wide for the public portfolio. **Do not replace them with generated illustrations.** The full-resolution original PNG files remain available in the founder's conversation export; publishing those exact PNGs requires a separate binary upload.

The fixed read-only folder is served before the optional FTP redirect in `index.js`. This is intentional: admin-managed uploads may be stored on FTP, but committed founder media should always be available locally. No database migration or API authentication change is needed.

### Deployment verification

- Check `GET /uploads/founder/openmindai-desktop.webp` responds with `image/webp`.
- Check `GET /uploads/founder/openmind-studio-desktop.webp` responds with `image/webp`.
- Verify both routes work with local storage and with `UPLOAD_STORAGE_DRIVER=ftp`.
- Confirm `frontend/next.config.js` proxies `/uploads/:path*` to this backend and product case studies reference these paths.

Because filenames do not contain a content hash, avoid long-lived immutable edge caching if images will change frequently.
