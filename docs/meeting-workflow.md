# Meeting Workflow

## Meeting Creation

1. Admin or Facilitator creates a meeting.
2. User selects:
   - Centre
   - Club
   - Meeting date and time
   - Location type
   - Agenda template
3. User chooses or generates meeting roles from the selected agenda template.
4. Meeting starts as `draft`.
5. Meeting is published when ready for students to claim roles.

## Agenda Templates

Supported template types:

```text
Junior Regular Meeting
Senior Regular Meeting
Debate Meeting
Town Hall Leadership Challenge
Competition Meeting
Special Event
```

Each template is made of ordered sections and role slots. This replaces the old fixed-placeholder approach, where an agenda used fields like `role1_uid`, `role2_uid`, and `role3_uid`.

```text
agenda_template
  agenda_sections
    agenda_role_slots
```

Each section can include:

- section order
- start time
- duration
- notes
- facilitator-only notes
- student-visible instructions
- role slots
- speaker/evaluator pairings

## Student Role Claiming

1. Student logs in.
2. Student opens dashboard.
3. Student selects upcoming meeting.
4. Student sees open roles.
5. Student is encouraged to choose at least two roles when enough open slots are available.
6. Student clicks "Claim Role".
7. Backend verifies:
   - student belongs to the meeting's club
   - meeting is published
   - role is open
   - role was not claimed by another student
   - role is not locked
8. Role is assigned with:

```text
assignment_source = self_claimed
status = claimed
```

Claiming must use a database transaction or unique constraint to prevent duplicate assignment.

Rules:

- The same role slot cannot be claimed by more than one member.
- A member may claim multiple roles.
- The UI should encourage at least two role claims per member when there are enough roles available.
- Facilitator/Admin can override assignments.
- Facilitator/Admin can lock roles before a meeting.
- Facilitator/Admin can reopen roles if needed.

## Facilitator Override

Facilitator can:

- assign an open role
- replace an assigned student
- lock a role
- reopen a role
- clear a role assignment
- adjust speaker/evaluator pairings

Override records:

```text
assigned_by_user_id
assignment_source = facilitator_override
updated_at
```

## Agenda Download

1. User opens meeting.
2. User clicks "Download Agenda".
3. Backend loads:
   - meeting
   - centre
   - club
   - agenda template
   - agenda sections
   - agenda role slots
   - meeting role assignments
4. Backend renders a clean RTF agenda.
5. Open roles are shown as "Open".
6. Backend returns RTF file.

Endpoint:

```text
GET /api/meetings/:id/agenda.rtf
```

Agenda download permissions:

- Student/Member can download agendas for their own club meetings.
- Parent can download agendas for linked students' club meetings.
- Facilitator can download agendas for assigned clubs.
- Admin can download all agendas.

## Attendance Workflow

1. Facilitator opens meeting.
2. Facilitator marks each student:
   - present
   - absent
   - late
   - excused
3. Attendance contributes to PTB/Band requirements.
4. Parents and students can view attendance history.

## Scoring Workflow

1. Facilitator selects completed meeting.
2. Facilitator enters score and feedback for each student role performed.
3. Score is saved.
4. Student total score updates.
5. PTB/Band requirement progress recalculates.
6. Parent and student dashboards show updated progress.

## PTB/Band Progress Workflow

Band progress considers:

- total score
- attendance
- completed roles
- specific role requirements
- competition participation
- facilitator approval
- project completion

Admin can manually override if needed.
