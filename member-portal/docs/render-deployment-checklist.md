# Render Deployment Checklist

Use this checklist before testing `memberportal.ileapclub.com` online.

## 1. Repository

- Confirm the latest `main` branch is pushed to GitHub.
- Confirm `member-portal/` is the Render service root directory.
- Confirm `npm run build` passes locally.

## 2. Render Services

Create from the repository-root `render.yaml` or configure manually:

- Web service: `ileap-member-portal-api`
- Database: `ileap-member-portal-db`
- Root directory: `member-portal`
- Build command:

  ```bash
  npm install && npm run build && npm run prisma:migrate:deploy
  ```

- Start command:

  ```bash
  npm run start
  ```

## 3. Environment Variables

Required:

- `DATABASE_URL`: Render PostgreSQL connection string
- `JWT_SECRET`: generated secret, at least 32 characters
- `CLIENT_ORIGIN`: `https://memberportal.ileapclub.com`
- `PORT`: Render usually provides this automatically

Optional for private test seeding only:

- `SEED_ADMIN_EMAIL`
- `SEED_DEMO_PASSWORD`

Do not use the demo password for real users.

## 4. Migrations

Render runs:

```bash
npm run prisma:migrate:deploy
```

This applies all committed migrations:

- initial users, centres, clubs
- meetings and role slots
- attendance and scores
- band/PTB requirements

## 5. Seeding

For a private test environment, run manually from the Render shell:

```bash
npm run db:seed
```

This creates demo users and sample data. Do not run this on a production database with real family accounts unless you intentionally want demo records.

## 6. Smoke Tests

After deployment:

- Open `/api/health`
- Run an API smoke check:

  ```bash
  SMOKE_BASE_URL=https://your-render-url.onrender.com npm run smoke:api
  ```

- Sign in as the seeded admin
- Confirm Admin dashboard loads
- Create a centre
- Create a club
- Create a student user
- Create a meeting
- Assign or claim a role
- Download the agenda RTF
- Mark attendance
- Add a role score
- Confirm student dashboard shows progress

## 7. Domain

Point `memberportal.ileapclub.com` to the Render service only after the smoke tests pass on the temporary Render URL.
