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
Junior
Senior
Debate
Competition
Town Hall
```

Each template includes placeholders such as:

```text
{{MEETING_TITLE}}
{{MEETING_DATE}}
{{CENTRE_NAME}}
{{CLUB_NAME}}
{{ROLE:Meeting Chair}}
{{ROLE:Timer}}
{{ROLE:Speaker 1}}
```

## Student Role Claiming

1. Student logs in.
2. Student opens dashboard.
3. Student selects upcoming meeting.
4. Student sees open roles.
5. Student clicks "Claim Role".
6. Backend verifies:
   - student belongs to the meeting's club
   - meeting is published
   - role is open
   - role was not claimed by another student
7. Role is assigned with:

```text
assignment_source = self_claimed
status = claimed
```

Claiming must use a database transaction or unique constraint to prevent duplicate assignment.

## Facilitator Override

Facilitator can:

- assign an open role
- replace an assigned student
- lock a role
- reopen a role
- clear a role assignment

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
   - meeting role assignments
4. Backend replaces placeholders with assigned student names.
5. Backend returns RTF file.

Endpoint:

```text
GET /api/meetings/:id/agenda.rtf
```

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

