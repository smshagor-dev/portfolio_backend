# Realtime compatibility design

Laravel backend includes server-sent event (SSE) streams as a **local/HTTP-compatible alternative** to the old Express Socket.IO server. They do not speak the Socket.IO protocol, so the existing frontend must migrate its transport before realtime feature parity can be claimed.

## Authenticated admin notifications

    GET /api/admin/live-events
    Authorization: Bearer <Sanctum token>
    Accept: text/event-stream

Event: admin:notification. The Last-Event-ID header supports reconnect/resume. Use fetch() streaming with the bearer header; browser EventSource cannot set Authorization headers directly.

## Private ticket messages

    GET /api/site/contact-ticket/{id}/events
    X-Ticket-Token: <private ticket token>
    Accept: text/event-stream

Event: ticket:message. Reconnect with Last-Event-ID set to the last received numeric message ID. Avoid putting the token in URL query strings.

## Server operation

- This is **poll-based SSE**, not Socket.IO or a WebSocket implementation.
- The request stays connected for up to 20 seconds and the client must reconnect automatically.
- Each concurrent stream occupies a PHP-FPM worker; configure FPM limits and Nginx buffering, and use Reverb/Redis or dedicated event infrastructure before high-traffic deployment.
- Notification records are persisted in MySQL, so a reconnect can resume without a distributed in-memory queue.
- The streams publish no automatic external emails or pushes.

The bundled Nginx configuration preserves dynamic /api/research-publications/default-thumbnail.svg routing while enforcing a restrictive CSP for static SVG files.
