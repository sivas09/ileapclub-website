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

## Form Email Endpoints

The Enroll Now form and the public inquiry forms post to Cloudflare Pages Functions:

```text
/api/enroll
/api/inquiry
```

These functions send submitted form data by email through Resend. The inquiry endpoint handles free-demo, contact, and franchise requests.

### Required External Service

Configure Resend:

1. Create or use a Resend account.
2. Verify the sending domain or sender email for `ileapclub.com`.
3. Create a Resend API key.
4. In Cloudflare Pages, add these production environment variables:

```text
RESEND_API_KEY=your_resend_api_key
ENROLL_FROM_EMAIL=iLEAP Club <registrations@ileapclub.com>
```

`ENROLL_FROM_EMAIL` must be a sender that Resend allows for the verified domain.

Enrollment and inquiry submissions are emailed to both:

```text
info@ileapclub.com
info@ileap.club
```

No database is used. Keep the form field names and `inquiry_type` values synchronized with the corresponding Pages Function when changing a form.
