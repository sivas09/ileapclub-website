# Phase 2 Member Portal Blueprint

## Scope

The Phase 2 portal is a separate application from the public website.

Domain:

```text
memberportal.ileapclub.com
```

Recommended stack:

```text
Frontend: React
Backend: Render Web Service
Database: Render PostgreSQL
Storage: Cloudflare R2
Email: Resend
```

This document is planning only. Do not scaffold React, create migrations, or implement application code yet.

## Roles

The portal supports four user roles:

```text
Admin
Facilitator
Parent
Student
```

Parents can manage multiple students. Students can belong to one or more clubs through club memberships.

## Core Concepts

- A Centre is a physical or online operating location.
- A Club is a cohort or group that belongs to a Centre.
- A Meeting belongs to a Club.
- Meeting Roles are open role slots for a specific meeting.
- Students can self-claim open roles.
- Facilitators can override role assignments.
- Parents can view their students' schedules, attendance, scores, band progress, and agenda downloads.
- Attendance is tracked per meeting per student.
- PTB/Band progress is tracked through requirements, not only total score.
- Agenda templates support Junior Regular, Senior Regular, Debate, Town Hall Leadership Challenge, Competition, and Special Event formats.
- Agenda templates are section-based and role-slot-based, replacing old fixed fields such as `role1_uid`, `role2_uid`, and `role3_uid`.
- Agenda templates support speaker/evaluator pairings, timings, notes, facilitator-only notes, and student-visible instructions.
- Future competitions are supported by dedicated competition-ready tables.
- Future resource library files are stored in Cloudflare R2.

## MVP Modules

1. Authentication and role-based access
2. Admin user management
3. Parent/student relationship management
4. Centre and club management
5. Club memberships
6. Meeting creation
7. Meeting role setup and self-claim
8. Facilitator role override
9. Agenda template, section, and role-slot selection
10. RTF agenda download
11. Attendance tracking
12. Score entry and feedback
13. PTB/Band requirements and progress tracking
14. Parent dashboard
15. Student dashboard

## Future Modules

- Competitions
- Certificates
- Resource library using Cloudflare R2
- AI speaking coach
- Facilitator dashboards
- Contest management
- Advanced reporting
- Parent communications

## Recommended Architecture

Use a single repository for the member portal, separate from the public website.

Suggested repo:

```text
ileap-member-portal
```

Recommended simple app structure:

```text
memberportal/
  package.json
  render.yaml
  .env.example
  src/
    client/
    server/
      auth/
      db/
      middleware/
      permissions/
      routes/
      services/
      rtf/
  prisma/
    schema.prisma
    seed.ts
```

Use:

- React + Vite
- Express or Fastify
- Prisma
- PostgreSQL
- Cookie-based sessions
- bcrypt or argon2 password hashing
- Zod validation
- RTF generation utility

## API Areas

- Auth
- Users
- Parents
- Students
- Centres
- Clubs
- Meetings
- Meeting roles
- Agenda templates
- Agenda sections
- Agenda role slots
- Attendance
- Scores
- PTB/Band requirements
- Progress dashboards
- Resource library metadata
- Competition-ready resources later

## Recommended API Routes

Auth:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

Users, parents, and students:

```text
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
GET    /api/parents/:id/students
POST   /api/parents/:id/students
DELETE /api/parents/:id/students/:studentId
GET    /api/students/:id/profile
PATCH  /api/students/:id/profile
```

Centres and clubs:

```text
GET    /api/centres
POST   /api/centres
PATCH  /api/centres/:id
GET    /api/centres/:id/clubs
GET    /api/clubs
POST   /api/clubs
PATCH  /api/clubs/:id
POST   /api/clubs/:id/memberships
DELETE /api/clubs/:id/memberships/:membershipId
```

Meetings, roles, and agendas:

```text
GET   /api/meetings
POST  /api/meetings
GET   /api/meetings/:id
PATCH /api/meetings/:id
POST  /api/meetings/:id/publish
POST  /api/meetings/:id/complete
GET   /api/meetings/:id/roles
POST  /api/meeting-roles/:id/claim
POST  /api/meeting-roles/:id/release
POST  /api/meeting-roles/:id/override
GET   /api/meetings/:id/agenda.rtf
GET   /api/agenda-templates
POST  /api/agenda-templates
PATCH /api/agenda-templates/:id
GET   /api/agenda-templates/:id/sections
POST  /api/agenda-templates/:id/sections
PATCH /api/agenda-sections/:id
POST  /api/agenda-sections/:id/role-slots
PATCH /api/agenda-role-slots/:id
```

Attendance, scores, and progress:

```text
GET   /api/meetings/:id/attendance
POST  /api/meetings/:id/attendance
PATCH /api/attendance/:id
POST  /api/scores
PATCH /api/scores/:id
GET   /api/students/:id/scores
GET   /api/students/:id/band-progress
GET   /api/band-levels
POST  /api/band-levels
PATCH /api/band-levels/:id
GET   /api/band-requirements
POST  /api/band-requirements
PATCH /api/band-requirements/:id
```

Dashboards:

```text
GET /api/dashboard/parent
GET /api/dashboard/student
GET /api/dashboard/facilitator
GET /api/dashboard/admin
```

Future resources and competitions:

```text
GET    /api/resources
POST   /api/resources
GET    /api/competitions
POST   /api/competitions
GET    /api/competitions/:id/entries
POST   /api/competitions/:id/entries
```

## Parent and Student Dashboard Requirements

Parent dashboard should show:

- linked students
- each student's clubs
- upcoming meetings
- role assignments
- agenda downloads
- attendance summary
- scores and facilitator feedback
- PTB/Band progress and missing requirements
- future resource library items assigned to the student

Student dashboard should show:

- assigned clubs
- upcoming meetings
- open roles available to claim
- current claimed roles
- agenda downloads
- attendance history
- score history
- feedback from facilitators
- PTB/Band progress and next requirements
- future resource library items

## Build Order

1. Finalize data model
2. Finalize permissions
3. Scaffold app
4. Add authentication
5. Add users, parents, and students
6. Add centres and clubs
7. Add club memberships
8. Add meetings
9. Add agenda templates, sections, and role slots
10. Add meeting roles generated from agenda role slots
11. Add self-claim workflow
12. Add facilitator override, locking, and reopening workflow
13. Add RTF agenda download
14. Add attendance
15. Add scoring
16. Add PTB/Band requirement tracking
17. Add parent dashboard
18. Add student dashboard
19. Deploy to Render
