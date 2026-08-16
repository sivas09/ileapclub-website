# iLEAP Production Deployment

This repository contains two separately deployed systems. Keep their build roots and settings separate.

## Public Website

The public marketing site for `ileapclub.com` lives at the repository root.

- Source: root HTML files, `css/`, `js/`, `assets/`, and `functions/`
- Hosting: Cloudflare Pages
- Pages root directory: repository root
- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production branch: `main`
- Security headers: repository-root `_headers`

Public enrollment and inquiry forms call the root Cloudflare Pages Functions at `/api/enroll` and `/api/inquiry`. Their Resend configuration is independent of the Member Portal API.

Required public-site environment variables:

```text
RESEND_API_KEY=your_resend_api_key
ENROLL_FROM_EMAIL=iLEAP Club <registrations@ileapclub.com>
```

## Member Portal

The authenticated portal for `member.ileapclub.com` is isolated under `member-portal/`.

### Cloudflare Pages Frontend

- Pages root directory: `member-portal`
- Build command: `npm run build:client`
- Build output directory: `dist/client`
- Production branch: `main`
- Security headers source: `member-portal/public/_headers`
- Required build variable: `VITE_API_BASE_URL=https://ileap-member-portal-api.onrender.com`

Vite copies `member-portal/public/_headers` into `dist/client/_headers` during the frontend build.

### Render API

The repository-root `render.yaml` defines the Express API deployment.

- Render root directory: `member-portal`
- Build command: `npm install && npm run build && npm run prisma:migrate:deploy`
- Start command: `npm run start`
- Health check: `/api/health`
- Database: Render PostgreSQL through `DATABASE_URL`

Required API variables include `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, and `CLIENT_ORIGINS`. Production migrations run only through the documented Render deployment command; do not run destructive database commands from a local machine.

## Security Headers

Both Cloudflare Pages frontends define basic response headers through `_headers`. CSP is intentionally omitted for now because the public forms and Member Portal API use separate origins. Add CSP only after testing every production script, image, form, and API origin.

## Deployment Flow

1. Run the relevant local checks.
2. Commit only changes belonging to the intended system.
3. Push to GitHub.
4. GitHub Actions validates `member-portal/` but does not deploy.
5. Cloudflare Pages deploys the affected frontend from `main`.
6. Render deploys the Member Portal API according to `render.yaml`.
