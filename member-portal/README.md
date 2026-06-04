# iLEAP Club Member Portal

Phase 2A foundation for `memberportal.ileapclub.com`.

## Current Scope

- React frontend
- Express backend for Render Web Service
- PostgreSQL data model through Prisma
- JWT login
- Role-aware dashboards for Admin, Facilitator, Parent, and Student

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and update `DATABASE_URL` and `JWT_SECRET`.

3. Create the database tables:

   ```bash
   npm run prisma:migrate
   ```

4. Seed the first admin user:

   ```bash
   npm run db:seed
   ```

5. Start the portal:

   ```bash
   npm run dev
   ```

Frontend: `http://localhost:5173`

API: `http://localhost:4000/api/health`

Seed login:

- Email: `admin@ileapclub.com`
- Password: `ChangeMe123!`

Change the seed password immediately outside local testing.

## Render Deployment

Use `render.yaml` as the starting blueprint. Configure:

- `DATABASE_URL` from Render PostgreSQL
- `JWT_SECRET` as a generated secret
- `CLIENT_ORIGIN` as `https://memberportal.ileapclub.com`

Run migrations during the first deployment before real users are added.
