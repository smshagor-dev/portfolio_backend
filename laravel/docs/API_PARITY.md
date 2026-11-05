# API contract migration tracker

Status legend: **implemented**, **partial**, **not migrated**.

| Module | Express routes | Laravel status |
|---|---|---|
| Health | GET /health | implemented at /api/health |
| Public portfolio | /api/site/home and related | in progress |
| Admin login and 2FA | /api/admin/login, /api/admin/2fa/* | in progress |
| Content CRUD | /api/admin/content, projects, articles, settings | in progress |
| Research publications | /api/research-publications | in progress |
| Contact tickets and Socket.IO | /api/site/contact*, websocket rooms | not migrated |
| AI assistant | /api/assistant | not migrated |
| Job agent and Gmail OAuth | /api/admin/job-agent/* | not migrated |
| Email open/click tracking | /api/job-agent/track/* | not migrated |
| Analytics and notifications | /api/site/analytics/*, /api/admin/notifications/* | not migrated |

JSON field casing in the existing Express app is camelCase; the migration will preserve field names where feasible. Do not route production traffic to Laravel until a contract-by-contract comparison passes.
