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

> **Deployment plan:** Render dashboard is the source of truth for current billing/plan. The workspace plan (for example, Hobby) and each resource's instance type are separate settings. Check the API service and PostgreSQL database individually in the dashboard; do not infer their live plans from an old repository value.

- Render root directory: `member-portal`
- Build command: `npm install && npm run build && npm run prisma:migrate:deploy`
- Start command: `npm run start`
- Health check: `/api/health`
- Database: Render PostgreSQL through `DATABASE_URL`
- Production requirement: use a paid API instance; do not run the production API on Render Free

The root `render.yaml` intentionally omits the API `plan`. Under Render's Blueprint rules, an existing service then retains its current dashboard-configured instance type, while a newly created service defaults to Starter. The database is not defined in this Blueprint and must be reviewed separately in the dashboard.

Confirm in Render's **Blueprints** page whether the production service is connected to this file. If it is Blueprint-managed, a sync applies fields declared in `render.yaml` and can overwrite conflicting dashboard changes. If the service was configured manually and is not attached to a Blueprint, `render.yaml` is only a reference and dashboard settings control the deployment. There is no `member-portal/render.yaml`; the only Render Blueprint file in this repository is the repository-root file.

Required API variables include `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, and `CLIENT_ORIGINS`. Production migrations run only through the documented Render deployment command; do not run destructive database commands from a local machine.

## Security Headers

Both Cloudflare Pages frontends define basic response headers through `_headers`. CSP is intentionally omitted for now because the public forms and Member Portal API use separate origins. Add CSP only after testing every production script, image, form, and API origin.

## Deployment Flow

1. Run the relevant local checks.
2. Commit only changes belonging to the intended system.
3. Push to GitHub.
4. GitHub Actions validates `member-portal/` but does not deploy.
5. Cloudflare Pages deploys the affected frontend from `main`.
6. Render deploys the Member Portal API from its dashboard configuration and, when a Blueprint is connected, the declared fields in the repository-root `render.yaml`.
7. Verify the resulting API and database instance types and current charges in the Render dashboard.
