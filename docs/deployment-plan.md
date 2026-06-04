# Phase 2 Deployment Plan

## Public Website vs Member Portal

Public website:

```text
ileapclub.com
Cloudflare Pages
Static HTML/CSS/JS
```

Member portal:

```text
memberportal.ileapclub.com
Render Web Service
React frontend
Node backend
Render PostgreSQL
Cloudflare R2
Resend
```

## Recommended Environments

Use separate environments:

```text
development
staging
production
```

## Render Services

Create:

- Render Web Service for app
- Render PostgreSQL database

Example future Render settings:

```text
Build command: npm install && npm run build
Start command: npm run start
```

## Environment Variables

Required for MVP:

```text
DATABASE_URL=
SESSION_SECRET=
APP_BASE_URL=https://memberportal.ileapclub.com
```

Required when email is added:

```text
RESEND_API_KEY=
EMAIL_FROM=
```

Required when R2 resource library is added:

```text
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

## Database

Use Render PostgreSQL.

Migrations should be run through the app deployment process only after schema review.

## Storage

Use Cloudflare R2 for future:

- resources
- worksheets
- certificates
- agenda exports
- media uploads
- facilitator materials

PostgreSQL stores metadata. R2 stores objects.

## Email

Use Resend later for:

- invites
- password reset
- role reminders
- parent notifications

Do not implement email until auth and core workflows are ready.

## DNS

Create DNS record:

```text
memberportal.ileapclub.com -> Render service
```

Exact DNS target depends on Render custom domain setup.

