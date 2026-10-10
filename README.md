# HRMS Workspace

A multi-tenant HRMS SaaS for Indian companies (2 to 10,000 employees). The build plan and
module roadmap are in [docs/ROADMAP.md](docs/ROADMAP.md).

The original clickable UI prototype is kept in [`prototype/index.html`](prototype/index.html)
(open it in a browser, no build step); the web app reuses its design system.

## Repository layout

```
apps/api         NestJS API, Prisma schema and migrations, e2e tests
apps/web         Next.js web app (HR admin + employee self-service)
packages/shared  Permission catalogue and Zod schemas used by both apps
prototype        The original single-file UI prototype
docs             Roadmap and design notes
```

## Run it with Docker

```bash
docker compose up --build
```

Open http://localhost:3000 and create a workspace.

## Local development

Needs Node 22, pnpm 10 and PostgreSQL 16 (or `docker compose up db`).

```bash
pnpm install
cp .env.example apps/api/.env       # set DATABASE_URL, JWT_ACCESS_SECRET and DATA_ENCRYPTION_KEY
pnpm db:migrate                     # create the schema
pnpm db:seed                        # demo workspace, see below
pnpm dev                            # API on :4000, web on :3000
```

The web app proxies `/api/*` to the API, so open http://localhost:3000.

Demo logins (workspace `demo`, password `DemoPass123`): `owner@demo.test` (Owner),
`vikram@demo.test` (Manager), `priya@demo.test` (Employee).

## Checks

```bash
pnpm build && pnpm typecheck && pnpm test
```

`pnpm test` runs the API's end-to-end tests against the database in `DATABASE_URL`,
including the checks that one workspace cannot see or change another's data.

## How multi-tenancy works

Every workspace-owned table has a `tenantId`. After the auth guard verifies the caller, it
stores their workspace in a per-request context; `PrismaService.db` is a Prisma client
extension that adds that `tenantId` to every query and every write
(`apps/api/src/prisma/tenant-scope.ts`). Referenced ids (department, manager, and so on)
are checked through the same scoped client before writing, so a workspace can't link to
another workspace's rows.

## Who sees what

| Permission                | Sees                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| `directory.read`          | Everyone's name, role, department and work contact (not people who have left) |
| `team.read`               | Full records of their whole reporting line                                    |
| `employee.read`           | Full records of everyone                                                      |
| `employee.sensitive.read` | Unmasked PAN, Aadhaar, UAN, ESIC and bank numbers                             |

Everyone sees their own record and profile in full. PAN, Aadhaar, UAN, ESIC and bank
account numbers are encrypted with AES-256-GCM under a key derived per workspace from
`DATA_ENCRYPTION_KEY` (`apps/api/src/crypto/field-crypto.ts`); others see only the last four
characters. Back that key up: without it those fields cannot be read.
