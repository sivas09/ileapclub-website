# Roles and Permissions

## Roles

```text
Admin
Facilitator
Parent
Student
```

## Admin

Admin can:

- Manage all users
- Create and edit parents, students, facilitators, and admins
- Create and edit centres
- Create and edit clubs
- Assign facilitators to clubs
- Assign students to clubs
- Create and edit meetings
- Publish, complete, or cancel meetings
- Override any role assignment
- Manage role definitions
- Manage agenda templates
- Manage agenda sections and agenda role slots
- Mark or edit attendance
- Enter and edit scores
- Manage band levels and requirements
- Override band progress
- View all dashboards
- Access future competition and resource library administration

## Facilitator

Facilitator can:

- View assigned centres and clubs
- View students in assigned clubs
- Create and edit meetings for assigned clubs
- Choose agenda templates for meetings
- Review agenda sections and role slots
- Publish meetings for assigned clubs
- Override role assignments in assigned clubs
- Lock or reopen meeting roles
- Adjust speaker/evaluator pairings
- Download meeting agendas
- Mark attendance
- Enter and edit scores for assigned club students
- View student progress dashboards for assigned clubs
- Recommend band advancement

Facilitators cannot:

- Manage users globally
- Access clubs they are not assigned to
- Manage billing or system settings
- Delete student history

## Parent

Parent can:

- Log in to a parent dashboard
- Manage multiple linked students
- View each student's clubs
- View upcoming meetings for each student
- View claimed roles and open role opportunities
- Download meeting agendas
- View attendance
- View scores and facilitator feedback
- View PTB/Band progress and requirements
- View announcements and future resources assigned to their students

Parent cannot:

- Claim roles for students in MVP unless explicitly enabled later
- Override role assignments
- Enter scores
- Mark attendance
- Manage club rosters

## Student

Student can:

- Log in to a student dashboard
- View assigned clubs
- View upcoming meetings
- Claim open meeting roles first-come-first-served
- Release own claimed role before a configured cutoff
- Download meeting agenda
- View own attendance
- View own scores and feedback
- View own PTB/Band progress
- View assigned resources in the future resource library

Student cannot:

- Claim a role in a club they do not belong to
- Override another student's role
- Enter scores
- Mark attendance
- Manage meetings

## Permission Rules

All permissions must be enforced server-side.

Key rules:

- Admin scope is global.
- Facilitator scope is limited to assigned clubs.
- Parent scope is limited to linked students.
- Student scope is limited to self.
- Role claiming must be transactional to prevent two students claiming the same role.
- Facilitator override must record who made the change and why.
