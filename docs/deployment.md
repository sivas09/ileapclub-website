# iLEAP Club Public Website Deployment

## Current Scope

This repository is for the public website at `ileapclub.com`.

Do not add portal functionality here. The future member portal belongs at `memberportal.ileap.club` and will be deployed separately on Render.

## Cloudflare Pages Settings

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production branch: `main`

## Deployment Flow

1. Edit locally in VS Code.
2. Test by opening `index.html` in a browser.
3. Commit changes to Git.
4. Push to GitHub.
5. Cloudflare Pages deploys automatically.

## Domains

- Primary: `ileapclub.com`
- Also configure: `www.ileapclub.com`
- Redirect later: `ileap.club` to `https://ileapclub.com`

## Static Form Note

The site is static. Forms currently show a client-side message only.

Before launch, connect forms to one of:

- Cloudflare Pages Functions
- Formspree
- HubSpot
- Zoho
- Airtable
- Another static form service

Until then, CTAs can use `mailto:info@ileapclub.com`.
