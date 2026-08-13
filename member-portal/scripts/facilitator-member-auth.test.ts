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

function assertEqual(actual: boolean | number, expected: boolean | number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
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
