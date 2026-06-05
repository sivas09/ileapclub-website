# Phase 2 Data Model

This model is planning only. Do not create migrations yet.

## Users and Roles

```text
users
- id
- first_name
- last_name
- email
- password_hash
- role
  - admin
  - facilitator
  - parent
  - student
- status
  - active
  - inactive
  - invited
- created_at
- updated_at
```

## Parent and Student Relationships

Parents can manage multiple students. A student can optionally have more than one parent/guardian.

```text
parent_students
- id
- parent_user_id
- student_user_id
- relationship
  - mother
  - father
  - guardian
  - other
- is_primary_contact
- created_at
```

## Centres and Clubs

Centres and Clubs are separate.

```text
centres
- id
- name
- city
- province
- address
- delivery_formats
  - in_person
  - online
  - hybrid
- status
- created_at
- updated_at
```

```text
clubs
- id
- centre_id
- name
- program_level
  - junior
  - senior
  - debate
  - competition
  - town_hall
- default_agenda_template_id
- status
- created_at
- updated_at
```

```text
club_memberships
- id
- club_id
- student_id
- status
  - active
  - inactive
- start_date
- end_date
- created_at
```

Students must not be modeled with a single `club_id`. A student may participate in multiple clubs or program groups.

```text
club_facilitators
- id
- club_id
- facilitator_user_id
- created_at
```

```text
centre_facilitators
- id
- centre_id
- facilitator_user_id
- created_at
```

Centre-level assignment allows a facilitator or future centre manager/franchise owner to operate across all clubs in a centre.

Future franchise support:

```text
centre_managers
- id
- centre_id
- user_id
- manager_type
  - franchise_owner
  - centre_manager
  - regional_manager
- status
- created_at
```

Reports should accept optional `centre_id` and `club_id` filters.

## Meetings

```text
meetings
- id
- club_id
- agenda_template_id
- title
- meeting_date
- start_time
- end_time
- location_type
  - in_person
  - online
  - hybrid
- location_details
- status
  - draft
  - published
  - completed
  - cancelled
- created_by_user_id
- created_at
- updated_at
```

## Roles and Meeting Role Assignments

Roles are reusable definitions. Agenda role slots define where roles appear inside a template. Meeting roles are the actual claimable slots for one meeting.

The old Drupal reference used fixed role placeholders such as `role1_uid`, `role2_uid`, and `role3_uid`. The new model replaces that fixed pattern with flexible role definitions, ordered agenda sections, and reusable role slots.

```text
roles
- id
- name
- description
- category
  - speaking
  - debate
  - leadership
  - evaluation
  - support
- is_active
- sort_order
- created_at
- updated_at
```

```text
meeting_roles
- id
- meeting_id
- agenda_role_slot_id
- role_id
- assigned_student_id
- assigned_by_user_id
- assignment_source
  - self_claimed
  - facilitator_override
  - admin_override
- status
  - open
  - claimed
  - locked
- locked_by_user_id
- locked_at
- override_reason
- created_at
- updated_at
```

## Agenda Templates

Support multiple templates:

```text
Junior Regular Meeting
Senior Regular Meeting
Debate Meeting
Town Hall Leadership Challenge
Competition Meeting
Special Event
```

```text
agenda_templates
- id
- name
- template_type
  - junior_regular
  - senior_regular
  - debate
  - town_hall
  - competition
  - special_event
- description
- is_default
- is_active
- created_at
- updated_at
```

```text
agenda_sections
- id
- agenda_template_id
- title
- description
- section_order
- default_start_time
- default_duration_minutes
- notes
- facilitator_notes
- student_instructions
- created_at
- updated_at
```

```text
agenda_role_slots
- id
- agenda_section_id
- role_id
- slot_label
- slot_order
- default_duration_minutes
- is_required
- allows_self_claim
- min_claims_per_member_hint
- paired_slot_id
- pairing_type
  - speaker_evaluator
  - debate_partner
  - team_role
  - none
- notes
- facilitator_notes
- student_instructions
- created_at
- updated_at
```

Notes:

- `agenda_sections` define the meeting flow.
- `agenda_role_slots` define claimable role slots inside each section.
- `meeting_roles` are generated from `agenda_role_slots` when a meeting is created.
- Speaker/evaluator pairing is represented by `paired_slot_id` and `pairing_type`.
- Open roles are displayed as `Open` in generated agendas.
- Members should be encouraged to claim at least two roles when enough slots are available.

## Attendance

```text
attendance
- id
- meeting_id
- student_id
- status
  - present
  - absent
  - late
  - excused
- marked_by_user_id
- notes
- created_at
- updated_at
```

## Scores and Feedback

```text
scores
- id
- meeting_id
- role_id
- student_id
- scorer_user_id
- score
- feedback
- created_at
- updated_at
```

## PTB/Band Levels and Requirements

Band progress should not rely only on total score.

```text
band_levels
- id
- name
  - White
  - Yellow
  - Orange
  - Green
  - Pink
  - Red
  - Brown
  - Black
  - Purple
  - Blue
- color
- order_index
- created_at
- updated_at
```

```text
band_requirements
- id
- band_level_id
- requirement_type
  - total_score
  - attendance_count
  - role_completion_count
  - specific_role_completed
  - competition_participation
  - facilitator_approval
  - project_completion
- requirement_key
- required_value
- created_at
- updated_at
```

```text
student_band_progress
- id
- student_id
- current_band_level_id
- total_score
- attendance_count
- completed_role_count
- last_evaluated_at
- manual_override
- override_reason
- updated_by_user_id
- updated_at
```

```text
student_requirement_progress
- id
- student_id
- band_requirement_id
- current_value
- is_completed
- completed_at
- updated_at
```

## Competition-Ready Tables

Do not build competition workflows in MVP, but reserve a clean model.

```text
competitions
- id
- name
- competition_type
  - public_speaking
  - debate
  - town_hall
  - bring_motion
  - leadership
- centre_id
- date
- status
- created_at
- updated_at
```

```text
competition_entries
- id
- competition_id
- student_id
- club_id
- role_or_category
- status
- score
- placement
- created_at
- updated_at
```

## Resource Library and R2

Future files are stored in Cloudflare R2. PostgreSQL stores metadata only.

```text
resources
- id
- title
- description
- resource_type
  - document
  - video
  - worksheet
  - agenda
  - certificate
  - training
- r2_object_key
- mime_type
- size_bytes
- visibility
  - admin
  - facilitator
  - parent
  - student
  - club
- club_id
- created_by_user_id
- created_at
- updated_at
```
