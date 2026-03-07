# Lead Microservice

**Enterprise-grade Contact & Lead Collection Microservice** — standalone Node.js/Express service with full lead pipeline management, multi-tenant isolation, proposal/contract workflow, file attachments, and external email delivery.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp env.sample .env
# Edit .env with your values

# 3. Start development server
npm run dev

# 4. Start production
npm start
```

Runs on `PORT=4002` by default.

---

## Architecture

- **Multi-tenant**: every document carries `tenantId`. All queries scoped by it.
- **Email is external**: delegates all email to `POST ${EMAIL_SERVICE_URL}/send-email`. Never sends email directly.
- **Fire-and-forget emails**: email calls are never awaited — API response is never blocked by email delivery.
- **Token validation**: verifies Bearer tokens by calling `POST ${AUTH_SERVICE_URL}/user/auth/verify/session`. No local `jwt.verify()`.
- **State machine**: lead status transitions are enforced by `leadService.updateLeadStatus()`. All side effects (fields, emails, history) are applied automatically.

---

## File Structure

```
lead-microservice/
├── app.js                          Express app setup
├── server.js                       Entry point (DB connect, cron start, HTTP listen)
├── env.sample                      Environment variable template
├── ENVIRONMENT_VARIABLES.md        Variable reference
├── src/
│   ├── config/
│   │   ├── setting.js              Reads process.env, exports config object
│   │   └── db.js                   MongoDB connection
│   ├── lib/
│   │   └── axiosCall.js            HTTP client utility (axios wrapper)
│   ├── middleware/
│   │   ├── auth.js                 Token verification via AUTH_SERVICE_URL
│   │   ├── adminAccess.js          Role check: admin | super_admin
│   │   ├── activityLogger.js       Request activity logging
│   │   ├── errorHandler.js         catchAsync, notFound, globalErrorHandler
│   │   ├── leadUpload.js           Multer config for lead file attachments
│   │   ├── logger.js               Winston logger
│   │   ├── rateLimit.js            In-memory rate limiter
│   │   ├── sanitization.js         XSS input sanitization
│   │   └── tenantMiddleware.js     requireTenantHeader / setTenantFromUser
│   ├── models/
│   │   ├── Lead.js                 Unified lead model + statics + pre-save hooks
│   │   └── Counter.js              Auto-increment counter
│   ├── email/
│   │   └── emailTemplate.js        Template ID registry (exported as string constants)
│   ├── services/
│   │   ├── leadService.js          Business logic + state machine
│   │   ├── leadEmailService.js     Email Microservice integration (fire-and-forget)
│   │   └── leadSchedulerService.js Cron jobs (expiry, follow-up, hold-resume)
│   ├── validator/
│   │   └── leads.js                express-validator chains for all routes
│   ├── controller/
│   │   └── leads/
│   │       ├── controller.js           Core: submit, list, CRUD, status, hold, won, lost
│   │       ├── proposalController.js   Proposal lifecycle
│   │       ├── contractController.js   Contract lifecycle
│   │       ├── attachmentController.js File upload/delete
│   │       └── importExportController.js CSV import
│   └── routes/
│       └── leads.js                All /api/leads routes (ordered: static → /:id)
└── uploads/
    └── leads/                      Lead file attachments (gitignored)
```

---

## API Reference

### Public Endpoints (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/leads/health` | Health check |
| `POST` | `/api/leads/submit` | Submit a new lead (public form) |
| `GET` | `/api/leads/:id/proposal/view/:version` | Proposal view tracking redirect |

### Authenticated Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/leads` | List leads (paginated) |
| `GET` | `/api/leads/stats` | Dashboard stats |
| `GET` | `/api/leads/proposals/stats` | Proposal funnel stats |
| `GET` | `/api/leads/export` | Export CSV |
| `GET` | `/api/leads/search` | Full-text search |
| `GET` | `/api/leads/follow-up` | Leads due for follow-up |
| `GET` | `/api/leads/proposals/expiring` | Proposals expiring soon |
| `POST` | `/api/leads/bulk-update` | Bulk update status/assignment |
| `POST` | `/api/leads/bulk-delete` | Bulk soft-delete |
| `POST` | `/api/leads/import` | CSV import |
| `GET` | `/api/leads/:id` | Single lead detail |
| `PATCH` | `/api/leads/:id` | Update lead fields |
| `DELETE` | `/api/leads/:id` | Soft-delete |
| `GET` | `/api/leads/:id/score` | Recompute score |
| `POST` | `/api/leads/:id/notes` | Add note |
| `POST` | `/api/leads/:id/contact` | Email the lead |
| `POST` | `/api/leads/:id/proposal` | Send proposal (v1) |
| `POST` | `/api/leads/:id/proposal/resend` | Resend current version |
| `POST` | `/api/leads/:id/proposal/revise` | New proposal version |
| `PATCH` | `/api/leads/:id/proposal/accept` | Accept proposal |
| `PATCH` | `/api/leads/:id/proposal/decline` | Decline proposal |
| `GET` | `/api/leads/:id/proposal/history` | All proposal versions |
| `GET` | `/api/leads/:id/proposal/:version` | Specific version |
| `POST` | `/api/leads/:id/contract` | Send contract |
| `PATCH` | `/api/leads/:id/contract/signed` | Mark contract signed → won |
| `PATCH` | `/api/leads/:id/status` | Generic status transition |
| `PATCH` | `/api/leads/:id/hold` | Put on hold |
| `PATCH` | `/api/leads/:id/reopen` | Reopen from on_hold/lost |
| `PATCH` | `/api/leads/:id/won` | Mark as won |
| `PATCH` | `/api/leads/:id/lost` | Mark as lost |
| `POST` | `/api/leads/:id/attachments` | Upload files |
| `DELETE` | `/api/leads/:id/attachments/:fileId` | Remove attachment |

### Admin-only Endpoints (role: `admin` \| `super_admin`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/leads/spam` | Spam leads |
| `POST` | `/api/leads/proposals/expire-check` | Trigger expiry check manually |
| `PATCH` | `/api/leads/:id/spam` | Toggle spam flag |
| `DELETE` | `/api/leads/:id/hard-delete` | Permanent delete |
| `PATCH` | `/api/leads/:id/reopen-admin` | Force-reopen archived/disqualified |

---

## Lead Status Flow

```
new → contacted → qualified → proposal_draft → proposal_sent → proposal_viewed
                             ↘ disqualified                  ↘ proposal_accepted → contract_sent → contract_signed → won
                                                              ↘ proposal_declined → proposal_revised → ...
                                                              ↘ proposal_expired
on_hold ← (most statuses) → archived
lost → new (reopen)
```

---

## Scheduler (cron jobs)

| Schedule | Job |
|---|---|
| Every hour | Expire overdue proposals |
| Every hour | Auto-reopen on_hold leads past `resumeDate` |
| Daily 8am | Send follow-up reminder emails to assigned agents |
| Daily 9am | Alert admin about proposals expiring in next 7 days |
