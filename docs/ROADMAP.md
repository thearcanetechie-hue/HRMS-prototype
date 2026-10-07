# HRMS build plan

A multi-tenant HRMS SaaS for Indian companies of 2 to 10,000 employees: an HR side and an
employee side, customisable by each company without code.

The target is about a month. That is enough for a working product across every module if
the order below is kept and each module ships its core first; depth (more reports, more
integrations, edge cases in payroll) keeps coming after.

## Stack

| Layer      | Choice                                                                        | Why                                                                                           |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Monorepo   | pnpm workspaces + Turborepo                                                   | One repo, shared types between API and web, cached builds                                     |
| API        | NestJS 11 (TypeScript)                                                        | Modules map one-to-one onto HR modules; guards, DI and testing built in                       |
| Database   | PostgreSQL 16 + Prisma 6                                                      | Relational data (org trees, payroll), JSON for custom fields, row-level security later        |
| Web        | Next.js 15 (React 19)                                                         | One app for HR admin and employee self-service; the prototype's design system is ported as-is |
| Validation | Zod schemas in `packages/shared`                                              | The same rules run in the browser and on the server                                           |
| Auth       | Argon2id passwords, 15-min JWT access token, rotating httpOnly refresh cookie | Reuse of a stolen refresh token revokes every session                                         |
| Infra      | Docker images for API and web, docker compose locally, GitHub Actions CI      | Deployable to any container host; India region (e.g. AWS Mumbai) for data residency           |

Newer majors exist (NestJS 12, Prisma 7, Next 16); these versions were picked for stability
and can be upgraded once the modules are in.

## Phases

### Phase 0: Foundation (this PR)

- Workspace sign-up and sign-in (workspace + email + password)
- Multi-tenant data model; every query is scoped to the caller's workspace, with tests proving one workspace can't read or write another's data
- Roles and permissions: Owner, HR Admin, Manager, Employee, plus custom roles built from a permission catalogue
- Org structure: legal entities (PAN/TAN/GSTIN), locations (with state, for PT/LWF), departments, designations
- Employee directory: add, edit, search, filter
- Audit log of every change
- Web app: sign-in, sign-up, dashboard, employees
- Docker, docker compose, CI

### Phase 1: Core HR (week 1)

- Invite employees to sign in; employee self-service profile
- Full employee profile: personal, family, bank, statutory IDs (PAN, Aadhaar, UAN, ESIC) with field-level encryption
- Manager-scoped data access (managers see their reporting line)
- Custom fields and forms (no-code), branding and module toggles from the Customise screen
- Document management: uploads to object storage, templates, e-sign hand-off
- Onboarding and offboarding checklists, exit settlement inputs

### Phase 2: Time (week 2)

- Configurable approval workflow engine (used by leave, attendance, expenses and more)
- Attendance: web and mobile check-in with geo-fence, shifts, rosters, regularisation
- Biometric integration: device push ingest (eSSL / ZKTeco style), CSV import fallback
- Leave: policies per entity/location, accrual, carry-forward, encashment, holiday calendars

### Phase 3: Money (week 3)

- Payroll: salary structures and CTC breakup, PF, ESI, Professional Tax by state, LWF, TDS (old and new regime), arrears, LOP from attendance
- Payslips, bank transfer files, PF ECR, ESIC and PT returns, Form 16
- Expense and reimbursement claims with receipts, policies and approvals, paid through payroll
- Payroll output reviewed with a chartered accountant before the first real run

### Phase 4: People (week 4)

- Performance: goals/OKRs, review cycles, 360 feedback
- Assessment management: tests, scoring, skill matrices
- Learning and development: courses, assignments, completion tracking
- Engagement: pulse surveys, mood check-in, recognition, anonymous feedback
- Internal communication: announcements, feed, Google Meet and Microsoft Teams meeting creation from the app

### Phase 5: Intelligence and platform

- Analytics and reporting: headcount, attrition, attendance, payroll cost, custom report builder, exports
- AI assistant (Claude): answers from the company's own policies and data, and only what the asking user is allowed to see
- Integrations hub: Google Workspace, Microsoft 365, Slack, accounting (Tally, Zoho Books), webhooks and a public API
- Notifications: email, in-app, WhatsApp

### Running throughout

- Security: Postgres row-level security as a second tenant wall, MFA, SSO (Google, Microsoft, SAML), rate limits, secrets management
- Compliance: DPDP Act 2023 (consent, data access and erasure requests), data retention rules
- Observability: structured logs, error tracking, uptime checks
- Deployment: staging and production environments, database backups, CD from `main`
