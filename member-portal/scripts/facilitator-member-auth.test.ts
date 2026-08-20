import { Role } from "@prisma/client";
import { canAdminResetPassword } from "../src/server/routes/admin.js";
import { isValidNewPassword } from "../src/server/routes/auth.js";
import { canEditDocumentScope, canPermanentlyDeleteDocument } from "../src/server/routes/documents.js";
import {
  canAccessStudentMemberships,
  canManageClubIdSet,
  canPermanentlyDeleteMemberRole,
  historicalDependencyReasons,
  permanentMemberDeleteDecision
} from "../src/server/routes/members.js";
import { canPermanentlyDeleteResourceLink } from "../src/server/routes/resources.js";
import { canManageBandRequirementDefinitions } from "../src/server/routes/student.js";
import { buildAgendaRtf } from "../src/server/services/agenda.js";
import {
  isReportRoleName,
  mainRoleNameForReportRole,
  reportRoleNameForMainRole
} from "../src/shared/portalConstants.js";
import {
  canManageRoleDefinitions,
  canReleaseMeetingRole,
  isLeadershipRoleName,
  roleAssignmentLimitViolation,
  sanitizeMeetingsForUser
} from "../src/server/routes/meetings.js";

const assignedClubId = "assigned-club";
const otherClubId = "other-club";

assertEqual(
  canManageClubIdSet(Role.FACILITATOR, [assignedClubId], [assignedClubId]),
  true,
  "facilitator can manage assigned club"
);
assertEqual(
  canManageClubIdSet(Role.FACILITATOR, [otherClubId], [assignedClubId]),
  false,
  "facilitator cannot manage unassigned club"
);
assertEqual(
  canManageClubIdSet(Role.FACILITATOR, [assignedClubId, otherClubId], [assignedClubId]),
  false,
  "facilitator cannot manage mixed assigned and unassigned clubs"
);
assertEqual(
  canManageClubIdSet(Role.ADMIN, [assignedClubId, otherClubId], [], 2),
  true,
  "admin can manage active clubs"
);
assertEqual(
  canManageClubIdSet(Role.ADMIN, [assignedClubId, otherClubId], [], 1),
  false,
  "admin cannot assign inactive or missing clubs"
);
assertEqual(
  canManageClubIdSet(Role.STUDENT, [assignedClubId], [assignedClubId]),
  false,
  "student cannot manage clubs"
);

assertEqual(
  canAccessStudentMemberships([assignedClubId], [{ clubId: assignedClubId, status: "ACTIVE" }]),
  true,
  "facilitator can access active student in assigned club"
);
assertEqual(
  canAccessStudentMemberships([assignedClubId], [{ clubId: otherClubId, status: "ACTIVE" }]),
  false,
  "facilitator cannot access student only in other club"
);
assertEqual(
  canAccessStudentMemberships([assignedClubId], [{ clubId: assignedClubId, status: "INACTIVE" }]),
  false,
  "inactive membership is hidden by default"
);
assertEqual(
  canAccessStudentMemberships([assignedClubId], [{ clubId: assignedClubId, status: "INACTIVE" }], true),
  true,
  "inactive membership can be managed when explicitly allowed"
);

assertEqual(
  canEditDocumentScope(Role.FACILITATOR, assignedClubId, assignedClubId),
  true,
  "facilitator can edit club-scoped documents"
);
assertEqual(
  canEditDocumentScope(Role.FACILITATOR, null, assignedClubId),
  false,
  "facilitator cannot edit global documents"
);
assertEqual(
  canEditDocumentScope(Role.FACILITATOR, assignedClubId, null),
  false,
  "facilitator cannot make documents global"
);
assertEqual(
  canEditDocumentScope(Role.ADMIN, null, null),
  true,
  "admin can edit global documents"
);
assertEqual(
  canPermanentlyDeleteDocument(Role.ADMIN),
  true,
  "admin can permanently delete documents"
);
assertEqual(
  canPermanentlyDeleteDocument(Role.FACILITATOR),
  false,
  "facilitator cannot permanently delete documents"
);
assertEqual(
  canPermanentlyDeleteDocument(Role.STUDENT),
  false,
  "student cannot permanently delete documents"
);
assertEqual(
  canPermanentlyDeleteResourceLink(Role.ADMIN),
  true,
  "admin can permanently delete resource links"
);
assertEqual(
  canPermanentlyDeleteResourceLink(Role.FACILITATOR),
  false,
  "facilitator cannot permanently delete resource links"
);
assertEqual(
  canPermanentlyDeleteResourceLink(Role.STUDENT),
  false,
  "student cannot permanently delete resource links"
);
assertEqual(
  canManageBandRequirementDefinitions(Role.ADMIN),
  true,
  "admin can manage band requirement definitions"
);
assertEqual(
  canManageBandRequirementDefinitions(Role.FACILITATOR),
  false,
  "facilitator cannot manage band requirement definitions"
);
assertEqual(
  canManageBandRequirementDefinitions(Role.STUDENT),
  false,
  "student cannot manage band requirement definitions"
);
assertEqual(
  canManageRoleDefinitions(Role.ADMIN),
  true,
  "admin can manage speaking role definitions"
);
assertEqual(
  canManageRoleDefinitions(Role.FACILITATOR),
  false,
  "facilitator cannot manage speaking role definitions"
);
assertEqual(
  canManageRoleDefinitions(Role.STUDENT),
  false,
  "student cannot manage speaking role definitions"
);
assertEqual(
  canReleaseMeetingRole(Role.ADMIN),
  true,
  "admin can release any meeting role"
);
assertEqual(
  canReleaseMeetingRole(Role.FACILITATOR),
  true,
  "facilitator can release meeting roles in assigned clubs"
);
assertEqual(
  canReleaseMeetingRole(Role.STUDENT, true),
  true,
  "student can release own meeting role"
);
assertEqual(
  canReleaseMeetingRole(Role.STUDENT, false),
  false,
  "student cannot release another student's meeting role"
);
assertEqual(
  isLeadershipRoleName("iFines Master"),
  true,
  "iFines Master is treated as a leadership role"
);
assertEqual(
  isLeadershipRoleName("iFinesMaster"),
  true,
  "iFinesMaster is treated as a leadership role"
);
assertEqual(
  isLeadershipRoleName("Prepared Speech"),
  false,
  "prepared speech is not treated as a leadership role"
);
assertEqual(
  roleAssignmentLimitViolation(
    [roleSlot("Prepared Speech"), roleSlot("iNews Report")],
    roleSlot("Prepared Speech Evaluator")
  ) !== null,
  true,
  "third role assignment is blocked"
);
assertEqual(
  roleAssignmentLimitViolation(
    [roleSlot("iChair")],
    roleSlot("iTimer")
  ) !== null,
  true,
  "second leadership role assignment is blocked"
);
assertEqual(
  roleAssignmentLimitViolation(
    [roleSlot("iChair")],
    roleSlot("Prepared Speech")
  ),
  null,
  "one leadership role plus one regular role is allowed"
);
assertEqual(
  roleAssignmentLimitViolation(
    [roleSlot("iChair"), roleSlot("iChair Report")],
    roleSlot("Prepared Speech 1")
  ),
  null,
  "auto-assigned report role does not count toward the two-role limit"
);
assertEqual(
  roleAssignmentLimitViolation(
    [roleSlot("iChair"), roleSlot("iChair Report")],
    roleSlot("iTimer")
  ) !== null,
  true,
  "student cannot claim two leadership main roles when a report is also assigned"
);
assertEqual(
  roleAssignmentLimitViolation([], roleSlot("iTimer Report")) !== null,
  true,
  "report roles cannot be claimed separately"
);
assertEqual(reportRoleNameForMainRole("iChair"), "iChair Report", "iChair maps to its report role");
assertEqual(reportRoleNameForMainRole("iGrammarian"), "iGrammarian Report", "iGrammarian maps to its report role");
assertEqual(mainRoleNameForReportRole("iTimer Report"), "iTimer", "report role maps back to its main role");
assertEqual(isReportRoleName("iFiller Counter Report"), true, "paired report roles are recognized");

const pairedAgenda = buildAgendaRtf({
  title: "Paired Roles Meeting",
  templateType: "Senior Regular Meeting",
  meetingDate: new Date("2026-08-22T00:00:00.000Z"),
  startTime: "10:00",
  location: "Club Room",
  club: { name: "Test Club", centre: { name: "Test Centre" } },
  roleSlots: [
    {
      id: "chair-main",
      sortOrder: 1,
      slotLabel: "iChair",
      roleDefinition: { name: "iChair" },
      assignedStudent: { user: { firstName: "Main", lastName: "Student" } }
    },
    {
      id: "chair-report",
      sortOrder: 2,
      slotLabel: "iChair Report",
      roleDefinition: { name: "iChair Report" },
      assignedStudent: null
    }
  ]
} as any);
assertEqual(
  pairedAgenda.includes("iChair Report: Main Student"),
  true,
  "agenda report rows use the matching main-role student"
);
assertEqual(
  JSON.stringify(sanitizeMeetingsForUser([meetingWithPrivateStudentData()] as any, "student-user", Role.STUDENT)).includes("other@example.com"),
  false,
  "student meeting response does not expose other student email"
);
assertEqual(
  JSON.stringify(sanitizeMeetingsForUser([meetingWithPrivateStudentData()] as any, "student-user", Role.STUDENT)).includes("student@example.com"),
  false,
  "student meeting response does not expose own raw email in nested meeting users"
);
assertEqual(
  sanitizeMeetingsForUser([meetingWithPrivateStudentData()] as any, "student-user", Role.STUDENT)[0].attendance.length,
  0,
  "student meeting response removes attendance roster"
);

assertEqual(
  canPermanentlyDeleteMemberRole(Role.ADMIN),
  true,
  "admin can permanently delete eligible members"
);
assertEqual(
  canPermanentlyDeleteMemberRole(Role.FACILITATOR),
  false,
  "facilitator receives 403 for permanent member deletion"
);
assertEqual(
  canPermanentlyDeleteMemberRole(Role.STUDENT),
  false,
  "student receives 403 for permanent member deletion"
);
assertEqual(
  historicalDependencyReasons(emptyDependencies()).length === 0,
  true,
  "eligible member with no dependencies can be deleted"
);
assertEqual(
  historicalDependencyReasons({ ...emptyDependencies(), attendance: 1, meetingFeedback: 1 }).length > 0,
  true,
  "related historical data is detected before permanent deletion"
);
assertEqual(
  permanentMemberDeleteDecision({
    authenticatedRole: Role.ADMIN,
    targetRole: Role.STUDENT,
    isSelf: false,
    blockingReasons: []
  }).status,
  200,
  "admin can delete an eligible member"
);
assertEqual(
  permanentMemberDeleteDecision({
    authenticatedRole: Role.FACILITATOR,
    targetRole: Role.STUDENT,
    isSelf: false,
    blockingReasons: []
  }).status,
  403,
  "facilitator delete request is forbidden"
);
assertEqual(
  permanentMemberDeleteDecision({
    authenticatedRole: Role.STUDENT,
    targetRole: Role.STUDENT,
    isSelf: true,
    blockingReasons: []
  }).status,
  403,
  "student delete request is forbidden"
);
assertEqual(
  permanentMemberDeleteDecision({
    authenticatedRole: null,
    targetRole: Role.STUDENT,
    isSelf: false,
    blockingReasons: []
  }).status,
  401,
  "unauthenticated delete request is rejected"
);
assertEqual(
  permanentMemberDeleteDecision({
    authenticatedRole: Role.ADMIN,
    targetRole: null,
    isSelf: false,
    blockingReasons: []
  }).status,
  404,
  "invalid or nonexistent member id is handled as not found"
);
assertEqual(
  permanentMemberDeleteDecision({
    authenticatedRole: Role.ADMIN,
    targetRole: Role.STUDENT,
    isSelf: false,
    blockingReasons: ["1 attendance record"]
  }).status,
  200,
  "admin can permanently delete a member with historical data"
);
assertEqual(
  isValidNewPassword("12345678"),
  true,
  "new passwords must allow at least 8 characters"
);
assertEqual(
  isValidNewPassword("short"),
  false,
  "new passwords shorter than 8 characters are rejected"
);
assertEqual(
  canAdminResetPassword(Role.ADMIN),
  true,
  "admin can reset user passwords"
);
assertEqual(
  canAdminResetPassword(Role.FACILITATOR),
  false,
  "facilitator cannot reset user passwords"
);
assertEqual(
  canAdminResetPassword(Role.STUDENT),
  false,
  "student cannot reset user passwords"
);

console.log("Facilitator authorization tests passed.");

function assertEqual(actual: boolean | number | string | null, expected: boolean | number | string | null, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function roleSlot(name: string) {
  return {
    slotLabel: name,
    roleDefinition: { name }
  };
}

function meetingWithPrivateStudentData() {
  return {
    id: "meeting-1",
    roleSlots: [
      {
        id: "slot-1",
        roleSlotId: "slot-1",
        assignedStudentId: "other-student",
        assignedStudent: {
          id: "other-student",
          userId: "other-user",
          grade: "6",
          programLevel: "JUNIOR",
          bandLevel: "White",
          user: {
            id: "other-user",
            email: "other@example.com",
            firstName: "Other",
            lastName: "Student",
            role: Role.STUDENT,
            isActive: true
          }
        },
        roleDefinition: { name: "Prepared Speech" },
        score: { id: "score-1" }
      },
      {
        id: "slot-2",
        roleSlotId: "slot-2",
        assignedStudentId: "student",
        assignedStudent: {
          id: "student",
          userId: "student-user",
          grade: "7",
          programLevel: "SENIOR",
          bandLevel: "Yellow",
          user: {
            id: "student-user",
            email: "student@example.com",
            firstName: "Current",
            lastName: "Student",
            role: Role.STUDENT,
            isActive: true
          }
        },
        roleDefinition: { name: "iChair" },
        score: { id: "score-2" }
      }
    ],
    attendance: [
      {
        id: "attendance-1",
        student: {
          user: {
            id: "other-user",
            email: "other@example.com",
            firstName: "Other",
            lastName: "Student",
            role: Role.STUDENT
          }
        }
      }
    ],
    roleScores: [{ id: "score-1", roleSlotId: "slot-1" }, { id: "score-2", roleSlotId: "slot-2" }],
    studentFeedbacks: [
      {
        id: "feedback-1",
        student: {
          id: "student",
          userId: "student-user",
          grade: "7",
          programLevel: "SENIOR",
          bandLevel: "Yellow",
          user: {
            id: "student-user",
            email: "student@example.com",
            firstName: "Current",
            lastName: "Student",
            role: Role.STUDENT
          }
        }
      }
    ]
  };
}

function emptyDependencies() {
  return {
    clubMemberships: 0,
    parentLinks: 0,
    assignedRoleSlots: 0,
    attendance: 0,
    roleScores: 0,
    meetingFeedback: 0,
    requirementProgress: 0,
    uploadedDocuments: 0,
    createdResourceLinks: 0,
    facilitatorClubAssignments: 0,
    facilitatorCentreAssignments: 0
  };
}
