# iLEAP Member Portal Handoff

Last updated: July 30, 2026

## Production Setup

- Frontend: https://member.ileapclub.com
- Cloudflare Pages project: `ileap-member-portal`
- Backend API: https://ileap-member-portal-api.onrender.com
- Database: Render PostgreSQL `ileap-member-portal-db`
- Repository root: `C:\ileap-new-website`
- Member portal app: `C:\ileap-new-website\member-portal`

Render dashboard is the source of truth for current billing/plan. The Hobby workspace plan does not identify the API or database instance type; inspect each resource separately. The production API must use a paid instance. The repository-root `render.yaml` omits `plan` so an existing service retains its dashboard-configured type, but any other declared fields can override dashboard changes when a connected Blueprint syncs.

## Current Test Accounts

Seeded demo password:

```text
ChangeMe123!
```

Seeded users:

- `admin@ileapclub.com`
- `facilitator@ileapclub.com`
- `student@example.com`

Parent accounts are currently disabled in the application.

## Important Commands

Run checks:

```powershell
cd C:\ileap-new-website\member-portal
npm.cmd run check
```

Run local development:

```powershell
cd C:\ileap-new-website\member-portal
npm.cmd run dev
```

Seed database:

```powershell
cd C:\ileap-new-website\member-portal
npm.cmd run db:seed
```

Render build/start:

```text
Build command: npm run build
Start command: npm run start
```

Cloudflare Pages:

```text
Root directory: member-portal
Build command: npm run build:client
Output directory: dist/client
```

Cloudflare frontend env:

```text
VITE_API_BASE_URL=https://ileap-member-portal-api.onrender.com
```

Render backend env:

```text
DATABASE_URL=<Render PostgreSQL URL>
JWT_SECRET=<secret>
CLIENT_ORIGIN=https://member.ileapclub.com
CLIENT_ORIGINS=https://member.ileapclub.com,https://ileap-member-portal.pages.dev
```

## Major Work Completed

### Cloud Deployment

- Split frontend/backend deployment support was added.
- Frontend API calls use `VITE_API_BASE_URL` when set.
- Local development still uses relative `/api` paths.
- Agenda `.rtf` download still works through the configured API base URL.
- Seed script loads environment variables correctly.

### Roles and Permissions

Active roles now used in the app:

- `ADMIN`
- `FACILITATOR`
- `STUDENT`

Parent accounts are disabled for now:

- Parent option removed from active frontend user creation.
- Backend rejects parent login.
- Seed deactivates parent users.
- Prisma enum still contains `PARENT` for production database compatibility.

Admin can:

- Manage centres, clubs, users, meetings, role assignments, attendance, scoring, feedback, agendas, and reports.
- Archive/restore centres and clubs.

Facilitator can:

- See and manage only assigned clubs.
- Create meetings for assigned clubs.
- Generate term meetings for assigned clubs.
- Override role claims within assigned clubs.
- Mark attendance and score roles for assigned club meetings.
- View feedback reports for assigned clubs only.

Student can:

- See only own club meetings.
- Claim open roles.
- Claim maximum 2 roles per meeting.
- View own progress and feedback.

### Meeting Creation Workflow

Meeting creation no longer requires selecting role slots manually.

Admin/facilitator now creates a meeting using:

- Club
- Meeting template/type
- Date
- Start time
- Location/link

Backend automatically creates all standard iLEAP claimable role slots for each new meeting.

Bulk/term meeting generation also automatically creates all standard role slots for every generated meeting.

### Standard iLEAP Roles

Standard role catalog lives in:

```text
member-portal/src/server/services/standardRoles.ts
```

It includes:

- `iChair`
- `iGrammarian`
- `iFiller Counter`
- `iFinesMaster`
- `iTimer`
- 4 prepared speech roles
- 4 prepared speech evaluator roles
- 4 prepared presentation roles
- 4 prepared presentation evaluator roles
- `iThink on My Feet Master`
- 4 iThink participant roles
- 4 iThink evaluator roles
- `iStory and Joke Master`
- 2 story/joke speaker roles
- 2 story/joke evaluator roles
- `Case Study Lead (20 Mins)`
- Report roles for iChair, iGrammarian, iFiller Counter, iFinesMaster, and iTimer

### Role Claiming

Backend enforces:

- Student must belong to the meeting club.
- Meeting roles must be unlocked.
- Slot must be open.
- Student can claim maximum 2 roles per meeting.
- Concurrent claims cannot overwrite an already claimed slot.

Managers can still override assignments.

### Feedback Reporting

Added report route:

```text
GET /api/reports/facilitator-feedback
```

Visibility:

- Admin sees all feedback.
- Facilitator sees assigned clubs only.
- Student sees own feedback only.

Report includes:

- Student name
- Club
- Meeting title/date
- Role performed
- Score
- Feedback/comment
- Evaluator/facilitator name
- Scored date

Frontend panel:

```text
Feedback -> Facilitator Feedback for Students
```

### Admin Setup Fixes

Fixed production error:

```text
Cannot read properties of null (reading 'reset')
```

Cause:

- React form handler used `event.currentTarget.reset()` after async work.

Fix:

- Capture form reference synchronously before awaiting.
- Guard reset safely.

Affected forms:

- Add Centre
- Add Club
- Add User

### Centre and Club Archiving

Centres and clubs are soft-archived using `isActive`.

Backend:

- Admin-only archive/restore endpoints for centres and clubs.
- No hard delete by default.
- Meeting creation rejects inactive clubs or clubs under inactive centres.

Frontend:

- Admin Setup shows Active/Archived badges.
- Admin can Archive/Restore Centre.
- Admin can Archive/Restore Club.
- Inactive centres hidden from Add Club.
- Inactive clubs hidden from normal user assignment and meeting creation.

## Key Files To Reference

Backend:

- `member-portal/src/server/routes/admin.ts`
- `member-portal/src/server/routes/auth.ts`
- `member-portal/src/server/routes/meetings.ts`
- `member-portal/src/server/routes/reports.ts`
- `member-portal/src/server/services/standardRoles.ts`
- `member-portal/src/server/services/agenda.ts`
- `member-portal/prisma/schema.prisma`
- `member-portal/prisma/seed.ts`

Frontend:

- `member-portal/src/client/App.tsx`
- `member-portal/src/client/api.ts`
- `member-portal/src/client/styles.css`

Deployment:

- `member-portal/package.json`
- `render.yaml` (repository root; there is no `member-portal/render.yaml`)
- `member-portal/.env.example`

## Recent Commits

- `d76c27f` Support split portal frontend and API deployment
- `f31ec34` Load env vars in portal seed script
- `87779b4` Stable member portal cloud deployment
- `1b292b0` Improve agenda templates and role signup
- `dfe4ca8` Add full student role claim list
- `aa8c770` Add role permissions and feedback reporting
- `186ce6e` Auto-create standard meeting role slots
- `7526ebc` Fix admin setup forms and archive clubs

## Known Local Uncommitted Files

These have intentionally not been committed unless explicitly requested:

- `Agenda-.rtf`
- `AgendaTemplate.rtf`
- `assets/images/...`

## Recommended Next Improvements

### High Priority

- Add edit/deactivate user management UI.
- Add edit club and edit centre UI.
- Add frontend controls for add/edit/remove meeting role slots after meeting creation.
- Add clearer loading/deployment status guidance for production testing.
- Add Playwright or API smoke tests for login, meeting creation, role claiming, and reports.

### Reporting

- Add filters to feedback report:
  - Club
  - Student
  - Date range
  - Role
- Add export CSV for feedback report.
- Add attendance report.
- Add role participation report.

### Student Experience

- Show claimed role count per meeting.
- Disable claim buttons after 2 roles with inline explanation.
- Improve student feedback history view with dates and evaluator names.

### Admin Experience

- Add separate user management table with deactivate/reactivate.
- Add facilitator assignment editor.
- Add student club assignment editor.
- Add show/hide archived toggle.

### Backend Hardening

- Add integration tests for authorization boundaries.
- Centralize club visibility and management checks.
- Add audit fields for archive actions.
- Consider removing `PARENT` from Prisma enum in a later planned database migration if parent accounts are permanently out of scope.

## How To Continue Later

When asking Codex to continue, say:

```text
Please read docs/member-portal-handoff.md first and continue from that state.
```

Then specify the next task, for example:

```text
Build the user deactivate/reactivate workflow for Admin.
```

or:

```text
Add frontend controls so Admin/Facilitator can add/edit/remove meeting role slots after a meeting is created.
```
