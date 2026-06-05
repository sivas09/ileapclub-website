# iLEAP Club Member Portal

Phase 2 foundation for `memberportal.ileapclub.com`.

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

API: `http://localhost:4000/api/health`

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

Use `render.yaml` as the starting blueprint. See `docs/render-deployment-checklist.md` before deploying.

Configure:

- `DATABASE_URL` from Render PostgreSQL
- `JWT_SECRET` as a generated secret
- `CLIENT_ORIGIN` as `https://memberportal.ileapclub.com`

The Render build command runs production migrations:

```bash
npm install && npm run build && npm run prisma:migrate:deploy
```

Seed demo data only for a private test environment. Do not seed demo users into a production portal that families can access.
