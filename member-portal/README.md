# iLEAP Club Member Portal

Phase 2 foundation for `member.ileapclub.com`.

## Current Scope

- React frontend
- Express backend for Render Web Service
- PostgreSQL data model through Prisma
- JWT login
- Role-aware dashboards for Admin, Facilitator, Parent, and Student
- Admin setup workspace for centres, clubs, users, students, parents, and facilitators

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.

3. Update `.env`:

   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CLIENT_ORIGIN`
   - `CLIENT_ORIGINS`
   - `VITE_API_BASE_URL`
   - `ENABLE_DEMO_CLEANUP` (leave `false` unless demo cleanup is deliberately needed)
   - optional local seed values: `SEED_ADMIN_EMAIL`, `SEED_DEMO_PASSWORD`

4. Create the database tables:

   ```bash
   npm run prisma:migrate
   ```

5. Seed demo data:

   ```bash
   npm run db:seed
   ```

6. Start the portal:

   ```bash
   npm run dev
   ```

Frontend: `http://localhost:5173`

API liveness: `http://localhost:4000/api/health`

API readiness, including a bounded PostgreSQL check: `http://localhost:4000/api/ready`

API smoke check, with the server running:

```bash
npm run smoke:api
```

Default seed login:

- Email: `admin@ileapclub.com`
- Password: `ChangeMe123!`

Change the seed password immediately outside local testing.

The seed also creates one sample centre, one club, one facilitator, one parent, one student, one meeting, role slots, attendance, scores, and band/PTB progress so the portal has realistic data for testing.

To use a different demo password:

```bash
SEED_DEMO_PASSWORD="your-local-demo-password" npm run db:seed
```

On Windows PowerShell:

```powershell
$env:SEED_DEMO_PASSWORD="your-local-demo-password"; npm run db:seed
```

## Render Deployment

Use the repository-root `render.yaml` as the starting blueprint. See `docs/render-deployment-checklist.md` before deploying.

Render dashboard is the source of truth for current billing/plan. A Hobby workspace can contain separately billed API and database resources, so do not use the workspace name or an old Blueprint value to identify a live resource's instance type. Production must use a paid API instance.

The root Blueprint intentionally omits `plan`: an existing service retains its dashboard-configured instance type and a new service defaults to Starter. First confirm whether the service is connected to a Render Blueprint. Blueprint syncs apply fields declared in `render.yaml`; a manually configured service that is not Blueprint-managed continues to use its dashboard settings. There is no `member-portal/render.yaml`.

Configure:

- `DATABASE_URL` from Render PostgreSQL
- `JWT_SECRET` as a generated secret
- `NODE_ENV` as `production`
- `ENABLE_DEMO_CLEANUP` as `false`; only set it to `true` for a deliberate, time-bounded cleanup operation
- `CLIENT_ORIGIN` as `https://member.ileapclub.com`
- `CLIENT_ORIGINS` as `https://member.ileapclub.com,https://members.ileapclub.com`
- `VITE_API_BASE_URL` as `https://ileap-member-portal-api.onrender.com` on Cloudflare Pages, then `https://api.member.ileapclub.com` after the API subdomain is ready

The Render build command runs production migrations:

```bash
npm ci --include=dev && npm run build && npm run prisma:migrate:deploy
```

The Render build explicitly includes devDependencies because TypeScript, Vite, Prisma CLI, and the React type declarations are required at compile time even though `NODE_ENV=production`. Do not omit devDependencies until after the build and migration step; the compiled server still runs with production runtime behavior.

Seed demo data only for a private test environment. Do not seed demo users into a production portal that families can access.
Demo cleanup endpoints are blocked when `NODE_ENV=production` unless `ENABLE_DEMO_CLEANUP=true`. They remain admin-only when enabled, and the admin UI shows a dry-run candidate count before bulk cleanup.
