# Environment Variables — Lead Microservice

All variables must be set in `.env` (copy from `env.sample`).

---

## App

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `PORT` | No | `4002` | HTTP port the service listens on |
| `APP_NAME` | No | `lead-microservice` | Display name for logs/health |
| `APP_VERSION` | No | `1.0.0` | Reported in `/health` response |

---

## Database

| Variable | Yes | — | Description |
|---|---|---|---|
| `MONGODB_URI` | Yes | — | MongoDB connection string. Example: `mongodb://localhost:27017/lead_microservice` |

---

## Contact / Lead Microservice

| Variable | Required | Default | Description |
|---|---|---|---|
| `EMAIL_SERVICE_URL` | Yes | `http://localhost:4001` | Base URL of the Email Microservice (no trailing slash). **All email is sent here.** |
| `EMAIL_SERVICE_API_KEY` | Yes | — | Bearer token for authenticating with the Email Microservice |
| `ADMIN_EMAIL` | Yes | — | Destination for all admin alerts (new lead, proposal accepted/declined, won, lost, etc.) |
| `DASHBOARD_URL` | Yes | `http://localhost:3000` | Frontend dashboard URL. Used to construct review links in emails. |
| `LEAD_FILE_MAX_SIZE_MB` | No | `10` | Maximum size (MB) for a single uploaded attachment file |
| `LEAD_FILE_ALLOWED_TYPES` | No | `pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,zip,csv` | Comma-separated list of allowed file extensions |
| `LEAD_PIPELINE_STAGES` | No | `New,Contacted,Qualified,Proposal Sent,Negotiation,Won,Lost,Archived` | Pipeline stage labels (UI display only — not enforced as enum) |
| `AUTH_SERVICE_URL` | Yes | `http://localhost:3500` | Base URL of the Auth Service used to verify Bearer tokens. **No local JWT validation.** |

---

## CORS

| Variable | No | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
|---|---|---|---|
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | |

---

## Notes

- **Email delivery is fire-and-forget** — a failure to deliver email never blocks or errors an API response.
- **Token validation is delegated** — this service calls `POST ${AUTH_SERVICE_URL}/user/auth/verify/session` for every authenticated request. It never validates JWTs locally.
- **Multi-tenant** — every database operation is scoped by `tenantId`. Never query without it.
