# Current Teaching Module

Each club may have one current teaching module. The assignment is a small, provider-neutral record containing a title, module number or code, HTTPS resource URL, optional description, last updater, and timestamps.

The module is intentionally separate from the existing resource-link catalog and band-document library. Those systems represent reusable collections with audience, band, category, and ordering metadata; a current teaching module is a single mutable club pointer. The `resourceUrl` may currently be a Google Drive link and can later reference Cloudflare R2 or another HTTPS storage provider without a schema or authorization change.

## Access

| Role | Read | Assign, replace, or remove |
| --- | --- | --- |
| Admin | Every club | Every club |
| Center Director | Clubs in an actively assigned centre | Clubs in an actively assigned centre |
| Facilitator | Directly assigned active clubs only | No |
| Member / Student | No | No |
| Parent | No | No |
| Inactive account | No | No |

The API enforces these rules. Unauthorized responses do not include module metadata or the resource URL. Facilitator access deliberately uses direct `ClubFacilitator` assignments and does not inherit centre-wide facilitator assignments.

## API

- `GET /api/teaching-modules` returns only clubs visible to the authenticated role.
- `PUT /api/teaching-modules/:clubId` creates or replaces the club's assignment.
- `DELETE /api/teaching-modules/:clubId` removes the assignment.

Only syntactically valid `https://` URLs are accepted. The UI opens the resource in a new tab with `noopener noreferrer`.

## Recommended Google Drive Sharing

Use **Restricted** Google Drive access. Share each module only with the named Google accounts of the Admins, Center Directors, and directly assigned Facilitators who need it. Do not use **Anyone with the link**.

Portal authorization controls who receives the stored URL, but it does not replace Google Drive permissions. Review Drive access whenever staff or club assignments change, and promptly remove accounts that no longer require the module.

## Deployment

Apply Prisma migration `20260908100000_current_teaching_module` before serving the updated application. No storage service, upload pipeline, new environment variable, or recurring infrastructure is introduced. The only ongoing storage is one small PostgreSQL row per assigned club.
