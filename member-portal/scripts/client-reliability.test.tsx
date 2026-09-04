import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMeetingsOverviewResponse, parseStudentProgressResponse, type LearningReflection, type Meeting, type MemberPointsProgress, type ResourceLink } from "../src/client/api";
import { AttendanceRosterForm, BandProgressEmptyState, MeetingEditForm, RoleAssignmentTable } from "../src/client/components/MeetingWorkspace";
import { PaymentStatusButton, paymentResetConfirmationMessage } from "../src/client/components/MembersWorkspace";
import { AdminWorkspace } from "../src/client/components/AdminWorkspace";
import { attendanceStatusLabel, LearningReflectionHistory, LearningReflectionPanel, StudentClubMembersPanel, StudentHomeSummaryView, StudentPointsProgress, StudentProgressDashboard } from "../src/client/components/StudentProgressPanels";
import { PortalRootErrorBoundary, WorkspaceErrorBoundary } from "../src/client/components/PortalErrorBoundary";
import { CenterDirectorScopeView } from "../src/client/components/CenterDirectorScopeView";
import {
  claimableMeetingRoleSlots,
  canManageUserFromSetup,
  canResetUserPasswordFromSetup,
  dateInputValue,
  formatDate,
  formatRole,
  groupResourceLinks,
  overviewLinksForRole,
  portalNavigationItems,
  resourceGroupFor,
  sectionHrefForHash
} from "../src/client/components/portalShared";

const meeting = meetingFixture();
const editMarkup = renderToStaticMarkup(
  <MeetingEditForm meeting={meeting} clubs={[meeting.club]} isSubmitting={false} onSave={() => undefined} />
);

assert.match(editMarkup, /value="2026-08-15"/, "Edit Meeting renders a valid date input without a runtime exception.");
assert.match(editMarkup, /value="Saturday Meeting"/, "Edit Meeting initializes the selected meeting title.");

const scoredMeeting: Meeting = {
  ...meeting,
  roleSlots: [{
    ...meetingRoleSlotFixture("speech", "Prepared Speech 1"),
    assignedStudentId: "student-1",
    assignedStudent: studentFixture(),
    score: {
      id: "score-1",
      meetingId: meeting.id,
      roleSlotId: "speech",
      studentId: "student-1",
      score: 88,
      feedback: "Strong speech"
    }
  }]
};
const meetingViewMarkup = renderToStaticMarkup(
  <RoleAssignmentTable meeting={scoredMeeting} resources={[]} onSelectResource={() => undefined} />
);
assert.match(meetingViewMarkup, /<th>Role<\/th>/, "Meeting View keeps the role column.");
assert.match(meetingViewMarkup, /<th>Assigned Member<\/th>/, "Meeting View keeps the assigned member column.");
assert.doesNotMatch(meetingViewMarkup, /<th>Score<\/th>/, "Meeting View does not display the score column.");
assert.doesNotMatch(meetingViewMarkup, /<th>Feedback<\/th>/, "Meeting View does not display the feedback column.");
assert.doesNotMatch(meetingViewMarkup, /88\/100|Strong speech/, "Meeting View does not expose score or feedback values.");

const attendanceMarkup = renderToStaticMarkup(
  <AttendanceRosterForm
    roster={[
      { studentId: "student-1", memberName: "Alex Student", status: "PRESENT", markedAt: "2026-09-04T15:00:00.000Z" },
      { studentId: "student-2", memberName: "Beth Student", status: null, markedAt: null }
    ]}
    statuses={{ "student-1": "PRESENT", "student-2": "" }}
    isSubmitting={false}
    onStatusChange={() => undefined}
    onSubmit={() => undefined}
  />
);
assert.match(attendanceMarkup, /<th>Member Name<\/th>/, "Attendance roster renders the member name column.");
assert.match(attendanceMarkup, /<th>Attendance Status<\/th>/, "Attendance roster renders the status column.");
assert.match(attendanceMarkup, />Present<\/option>/, "Attendance offers Present.");
assert.match(attendanceMarkup, />Absent<\/option>/, "Attendance offers Absent.");
assert.match(attendanceMarkup, />Not Marked<\/option>/, "Attendance displays a blank Not Marked option.");
assert.match(attendanceMarkup, />Save Attendance<\/button>/, "Attendance renders its save action.");
assert.doesNotMatch(attendanceMarkup, />Late<\/option>|>Excused<\/option>/, "Attendance does not offer Late or Excused.");
assert.equal(attendanceStatusLabel("PRESENT"), "Present", "Student attendance history uses the visible Present label.");
assert.equal(attendanceStatusLabel("ABSENT"), "Absent", "Student attendance history uses the visible Absent label.");
const emptyBandProgressMarkup = renderToStaticMarkup(<BandProgressEmptyState />);
assert.match(emptyBandProgressMarkup, /No band progress has been recorded yet\./, "Empty band progress renders a friendly state.");
assert.doesNotMatch(emptyBandProgressMarkup, /invalid response/i, "Empty band progress never renders a validator error.");

const memberProgressMarkup = renderToStaticMarkup(<StudentProgressDashboard />);
assert.match(memberProgressMarkup, /Member Progress Dashboard/, "Member progress uses member-facing terminology.");
assert.doesNotMatch(memberProgressMarkup, /Student Progress Dashboard/, "Legacy student dashboard wording is hidden.");
const clubMembersMarkup = renderToStaticMarkup(<StudentClubMembersPanel />);
assert.match(clubMembersMarkup, /Club Members/, "My Club uses member-facing terminology.");
assert.doesNotMatch(clubMembersMarkup, /Payment Status|Paid|Not Paid/, "My Club does not expose payment status.");
assert.doesNotMatch(clubMembersMarkup, /My Points|Progress Notes from Staff|Recent Point History|Add Points/, "My Club does not expose points or progress notes.");

const pointsFixture: MemberPointsProgress = {
  studentId: "student-1",
  totalPoints: 12,
  progressNote: {
    note: "Shows confidence and supports other members.",
    updatedAt: "2026-09-04T18:00:00.000Z",
    updatedBy: { firstName: "Pat", lastName: "Facilitator", role: "FACILITATOR" }
  },
  transactions: [{
    id: "point-1",
    pointsDelta: 5,
    reason: "Great participation",
    awardedAt: "2026-09-04T18:00:00.000Z",
    awardedBy: { firstName: "Pat", lastName: "Facilitator", role: "FACILITATOR" }
  }]
};
const studentPointsMarkup = renderToStaticMarkup(<StudentPointsProgress progress={pointsFixture} />);
assert.match(studentPointsMarkup, /Progress Notes from Staff/, "Student progress shows staff progress notes.");
assert.match(studentPointsMarkup, /Shows confidence and supports other members\./, "Student progress renders the current staff note.");
assert.match(studentPointsMarkup, /\+5 points/, "Student progress renders recent point history.");
assert.doesNotMatch(studentPointsMarkup, /Add Points|Save Progress Notes/, "Student points view is read-only.");

const paidButtonMarkup = renderToStaticMarkup(
  <PaymentStatusButton memberName="Max Mao" status="PAID" disabled={false} onToggle={() => undefined} />
);
assert.match(paidButtonMarkup, />Paid<\/button>/, "Admin payment control clearly displays Paid.");
assert.match(paidButtonMarkup, /Mark Max Mao as Not Paid/, "Paid control clearly describes its toggle action.");
const notPaidButtonMarkup = renderToStaticMarkup(
  <PaymentStatusButton memberName="Max Mao" status="NOT_PAID" disabled={false} onToggle={() => undefined} />
);
assert.match(notPaidButtonMarkup, />Not Paid<\/button>/, "Admin payment control clearly displays Not Paid.");
assert.equal(
  paymentResetConfirmationMessage,
  "Are you sure you want to reset all active members to Not Paid for this month?",
  "Monthly reset uses the required confirmation wording."
);

const parsedProgress = parseStudentProgressResponse({
  student: {
    id: "student-1",
    userId: "student-user-1",
    grade: "7",
    bandLevel: "White",
    user: {
      id: "student-user-1",
      firstName: "Max",
      lastName: "Mao",
      role: "STUDENT"
    },
    attendance: [],
    roleSlots: [],
    roleScores: []
  },
  feedback: [],
  memberFeedback: [{
    id: "member-feedback-1",
    clubName: "Kanata Saturday",
    feedback: "Excellent preparation.",
    facilitatorName: "Pat Facilitator",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z"
  }],
  requirements: [{
    requirement: {
      id: "white-speech",
      programLevel: "SENIOR",
      bandLevel: "White",
      bandOrder: 1,
      name: "Deliver the first prepared speech",
      description: "Complete a prepared speech at a club meeting.",
      requirementType: "Speech",
      targetCount: 1,
      sortOrder: 1,
      isActive: true
    },
    currentCount: 0,
    isCompleted: false
  }],
  summary: {
    bandLevel: "White",
    programLevel: "SENIOR",
    clubName: "Kanata Saturday",
    centreName: "Kanata",
    attendanceRate: null,
    totalMeetingsMarked: 0,
    rolesCompleted: 0,
    scoredRoles: 0,
    averageScore: null
  }
});
assert.equal(parsedProgress.memberFeedback[0]?.feedback, "Excellent preparation.", "Member-level feedback is retained in My Progress responses.");
assert.equal("email" in parsedProgress.student.user, false, "Student progress validates without exposing the member email.");
const reflectionFormMarkup = renderToStaticMarkup(<LearningReflectionPanel progress={parsedProgress} />);
assert.match(reflectionFormMarkup, /Reflection Date/, "Student reflection form renders the reflection date field.");
assert.match(reflectionFormMarkup, /type="date"[^>]*value="\d{4}-\d{2}-\d{2}"/, "Reflection date defaults to today's local date.");
assert.match(reflectionFormMarkup, />Save Reflection<\/button>/, "Student reflection form renders the Save Reflection button.");
assert.doesNotMatch(reflectionFormMarkup, /Session \(optional\)|No session selected/, "Student reflection form no longer renders meeting selection.");
const reflectionFixture: LearningReflection = {
  id: "reflection-1",
  studentId: "student-1",
  meeting: null,
  reflectionDate: "2026-08-20T00:00:00.000Z",
  whatLearned: "How to structure a speech.",
  whatDidWell: "Spoke clearly.",
  whatToImprove: "Use more eye contact.",
  bandRequirement: null,
  thinksBandRequirementCompleted: true,
  facilitatorResponse: "Keep practising.",
  respondedBy: "Pat Facilitator",
  respondedAt: "2026-08-21T12:00:00.000Z",
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  canDelete: false
};
const reflectionHistoryMarkup = renderToStaticMarkup(
  <LearningReflectionHistory reflections={[reflectionFixture]} onEdit={() => undefined} onDelete={() => undefined} />
);
assert.match(reflectionHistoryMarkup, /Reflection Date:.*Aug.*20.*2026/, "Previous reflections display the reflection date.");
assert.match(reflectionHistoryMarkup, /How to structure a speech\./, "Previous reflections display what the member learned.");
assert.match(reflectionHistoryMarkup, /Staff response.*Keep practising\./, "Previous reflections display an available staff response.");
const studentOverviewMarkup = renderToStaticMarkup(
  <StudentHomeSummaryView
    user={{ id: "student-user-1", email: "max@example.com", firstName: "Max", lastName: "Mao", role: "STUDENT" }}
    progress={parsedProgress}
    paymentStatus={{ paymentMonth: "2026-09", status: "PAID", updatedAt: "2026-09-02T12:00:00.000Z" }}
  />
);
assert.match(studentOverviewMarkup, /Max Mao/, "Student Overview renders the member name.");
assert.match(studentOverviewMarkup, /White/, "Student Overview renders the current band.");
assert.match(studentOverviewMarkup, /Kanata Saturday/, "Student Overview renders the active club.");
assert.match(studentOverviewMarkup, /Senior/, "Student Overview renders the program level.");
assert.match(studentOverviewMarkup, /Deliver the first prepared speech/, "Student Overview renders the next requirement.");
assert.match(studentOverviewMarkup, /Payment Status/, "Student Overview shows the member payment card.");
assert.match(studentOverviewMarkup, />Paid</, "Student Overview shows a Paid status.");
assert.match(studentOverviewMarkup, /Payment received for this month\. Thank you\./, "Student Overview shows the paid confirmation note.");

const unpaidStudentOverviewMarkup = renderToStaticMarkup(
  <StudentHomeSummaryView
    user={{ id: "student-user-1", email: "max@example.com", firstName: "Max", lastName: "Mao", role: "STUDENT" }}
    progress={parsedProgress}
    paymentStatus={{ paymentMonth: "2026-09", status: "NOT_PAID", updatedAt: null }}
  />
);
assert.match(unpaidStudentOverviewMarkup, />Not Paid</, "Student Overview shows a Not Paid status.");
assert.match(
  unpaidStudentOverviewMarkup,
  /Payment not recorded for this month\. Please contact iLEAP Club or complete your payment\./,
  "Student Overview shows the required friendly Not Paid note."
);

const parsedOverview = parseMeetingsOverviewResponse({
  meetings: [meeting],
  roleDefinitions: [],
  clubs: [meeting.club],
  students: []
});
assert.equal(parsedOverview.meetings[0]?.id, meeting.id, "Valid meeting responses retain existing API behavior.");

assert.throws(
  () => parseMeetingsOverviewResponse({ meetings: [{ ...meeting, roleSlots: null }], roleDefinitions: [], clubs: [meeting.club], students: [] }),
  /invalid response/,
  "Malformed meeting arrays are rejected before React renders them."
);
assert.throws(
  () => parseMeetingsOverviewResponse({ meetings: [{ ...meeting, meetingDate: "not-a-date" }], roleDefinitions: [], clubs: [meeting.club], students: [] }),
  /invalid response/,
  "Invalid meeting dates are rejected before React renders them."
);

assert.equal(dateInputValue("not-a-date"), "", "Invalid edit-form dates fail safely.");
assert.equal(formatDate("not-a-date"), "Date unavailable", "Invalid display dates fail safely.");

const workspaceBoundary = new WorkspaceErrorBoundary({
  workspace: "Meetings",
  anchorId: "meetings",
  children: <div>Meetings content</div>
});
workspaceBoundary.state = { hasError: true };
const workspaceFallback = renderToStaticMarkup(workspaceBoundary.render());
assert.match(workspaceFallback, /Something went wrong while loading Meetings/, "Workspace failures render an isolated fallback.");
assert.match(workspaceFallback, /Retry/, "Workspace failures offer recovery.");

const rootBoundary = new PortalRootErrorBoundary({ children: <div>Portal content</div> });
rootBoundary.state = { hasError: true };
const rootFallback = renderToStaticMarkup(rootBoundary.render());
assert.match(rootFallback, /unexpected error/, "Catastrophic render failures produce a visible portal fallback.");
assert.match(rootFallback, /Reload Portal/, "The portal fallback offers a reload action.");

assert.deepEqual(
  overviewLinksForRole("ADMIN").map((item) => item.label),
  ["Setup", "Members", "Meetings", "Documents", "Feedback", "Band Progress"],
  "Admin Overview exposes the requested management sections."
);
assert.deepEqual(
  portalNavigationItems.CENTER_DIRECTOR.map((item) => item.label),
  ["Overview", "Setup", "Members", "Notices", "Documents", "Meetings", "Feedback", "Band Progress"],
  "Center Director receives the operational navigation set."
);
assert.deepEqual(
  overviewLinksForRole("CENTER_DIRECTOR").map((item) => item.label),
  ["Setup", "Members", "Meetings", "Documents", "Feedback", "Band Progress"],
  "Center Director Overview exposes operational management sections."
);
assert.equal(formatRole("CENTER_DIRECTOR"), "Center Director", "Center Director uses the visible role label.");
const directorScopeMarkup = renderToStaticMarkup(
  <CenterDirectorScopeView centres={[{ id: "centre-1", name: "Kanata Centre" }]} />
);
assert.match(directorScopeMarkup, /Assigned Centre/, "Center Director dashboard labels its assigned-centre scope.");
assert.match(directorScopeMarkup, /Kanata Centre/, "Center Director dashboard lists the assigned centre.");
const unassignedDirectorMarkup = renderToStaticMarkup(<CenterDirectorScopeView centres={[]} />);
assert.match(
  unassignedDirectorMarkup,
  /No centre has been assigned to your account\. Please contact the administrator\./,
  "Center Director dashboard explains an empty centre assignment clearly."
);
const directorViewer = { id: "director-1", role: "CENTER_DIRECTOR" as const };
assert.equal(canManageUserFromSetup(directorViewer, { id: "student-1", role: "STUDENT" }), true, "Center Director can manage student controls.");
assert.equal(canManageUserFromSetup(directorViewer, { id: "admin-1", role: "ADMIN" }), false, "Center Director cannot see Admin account controls.");
assert.equal(canManageUserFromSetup(directorViewer, { id: "director-2", role: "CENTER_DIRECTOR" }), false, "Center Director cannot see Center Director account controls.");
assert.equal(canManageUserFromSetup(directorViewer, directorViewer), false, "Center Director cannot manage their own account controls.");
assert.equal(canResetUserPasswordFromSetup({ role: "ADMIN" }, { role: "STUDENT" }), true, "Admin sees password reset for members.");
assert.equal(canResetUserPasswordFromSetup({ role: "ADMIN" }, { role: "FACILITATOR" }), true, "Admin sees password reset for facilitators.");
assert.equal(canResetUserPasswordFromSetup({ role: "ADMIN" }, { role: "CENTER_DIRECTOR" }), true, "Admin sees password reset for center directors.");
assert.equal(canResetUserPasswordFromSetup({ role: "ADMIN" }, { role: "ADMIN" }), false, "Admin-to-admin password reset stays hidden.");
assert.equal(canResetUserPasswordFromSetup({ role: "CENTER_DIRECTOR" }, { role: "STUDENT" }), true, "Center Director sees password reset for scoped members.");
assert.equal(canResetUserPasswordFromSetup({ role: "CENTER_DIRECTOR" }, { role: "FACILITATOR" }), true, "Center Director sees password reset for scoped facilitators.");
assert.equal(canResetUserPasswordFromSetup({ role: "CENTER_DIRECTOR" }, { role: "CENTER_DIRECTOR" }), false, "Center Director does not see reset for center directors.");
assert.equal(canResetUserPasswordFromSetup({ role: "FACILITATOR" }, { role: "STUDENT" }), false, "Facilitator never sees password reset controls.");

const adminSetupMarkup = renderToStaticMarkup(
  <AdminWorkspace currentUser={{ id: "admin-1", email: "admin@example.com", firstName: "Admin", lastName: "User", role: "ADMIN" }} />
);
assert.match(adminSetupMarkup, /value="CENTER_DIRECTOR"[^>]*>Center Director/, "Admin sees Center Director as a role option.");
const directorSetupMarkup = renderToStaticMarkup(
  <AdminWorkspace currentUser={{ id: "director-1", email: "director@example.com", firstName: "Center", lastName: "Director", role: "CENTER_DIRECTOR" }} />
);
assert.doesNotMatch(directorSetupMarkup, /value="ADMIN"|value="CENTER_DIRECTOR"/, "Center Director cannot select Admin or Center Director roles.");
assert.doesNotMatch(directorSetupMarkup, /Demo\/Test Data Cleanup/, "Center Director does not see true Admin-only cleanup controls.");
assert.deepEqual(
  overviewLinksForRole("FACILITATOR").map((item) => item.label),
  ["Members", "Meetings", "Documents", "Feedback", "Band Progress"],
  "Facilitator Overview remains scoped to facilitator sections."
);
assert.deepEqual(
  overviewLinksForRole("STUDENT").map((item) => item.label),
  ["My Club", "Meetings", "My Progress", "Resources"],
  "Student Overview exposes only member-facing sections."
);
assert.equal(sectionHrefForHash("ADMIN", "#meetings"), "#meetings", "Direct meeting links open the Meetings workspace.");
assert.equal(sectionHrefForHash("ADMIN", "#resources/resource-1"), "#documents", "Nested manager resource links stay in Documents.");
assert.equal(sectionHrefForHash("STUDENT", "#admin"), "#overview", "Student navigation rejects unauthorized workspace hashes.");

const groupedResources = groupResourceLinks([
  resourceFixture("leadership", "iChair Guide", "Role Guide", "iChair"),
  resourceFixture("speaking", "Prepared Speech Help", "Role Guide", "Prepared Speech"),
  resourceFixture("evaluation", "Speech Evaluator Help", "Role Guide", "Speech Evaluator"),
  resourceFixture("speech-guide", "Writing a Speech", "Speech Guide"),
  resourceFixture("presentation-guide", "Presentation Planning", "Presentation Guide"),
  { ...resourceFixture("band", "Brown I Requirements", "Document"), bandLevel: "Brown I" }
]);
assert.deepEqual(
  groupedResources.map((group) => group.label),
  ["Leadership Roles", "Speaking Roles", "Evaluator Roles", "Speech Guides", "Presentation Guides", "Band Resources"],
  "Resources are grouped in the stable navigation order."
);
assert.equal(
  resourceGroupFor(resourceFixture("support", "Timer Report", "Report Guide", "Timer Report")),
  "Support Roles",
  "Unmatched role and report guides remain available under Support Roles."
);

const bookingMeeting: Meeting = {
  ...meeting,
  roleSlots: [
    meetingRoleSlotFixture("chair", "iChair"),
    meetingRoleSlotFixture("chair-report", "iChair Report"),
    meetingRoleSlotFixture("grammarian-report", "iGrammarian Report"),
    meetingRoleSlotFixture("speech", "Prepared Speech 1")
  ]
};
assert.deepEqual(
  claimableMeetingRoleSlots(bookingMeeting).map((slot) => slot.roleDefinition.name),
  ["iChair", "Prepared Speech 1"],
  "Book Roles hides paired report roles from student claiming."
);

console.log("Client reliability regression tests passed.");

function resourceFixture(id: string, title: string, category: string, roleKey: string | null = null): ResourceLink {
  return {
    id,
    title,
    explanation: `${title} explanation`,
    category,
    roleKey,
    status: "ACTIVE",
    createdAt: "2026-08-16T12:00:00.000Z",
    createdBy: "Admin"
  };
}

function meetingFixture(): Meeting {
  return {
    id: "meeting-1",
    clubId: "club-1",
    title: "Saturday Meeting",
    templateType: "Senior Regular Meeting",
    meetingDate: "2026-08-15T00:00:00.000Z",
    startTime: "14:00",
    location: "Room 202",
    isRoleLocked: false,
    club: {
      id: "club-1",
      centreId: "centre-1",
      name: "Kanata Saturday",
      program: "Senior",
      isActive: true
    },
    roleSlots: [],
    attendance: [],
    roleScores: [],
    studentFeedbacks: []
  };
}

function meetingRoleSlotFixture(id: string, roleName: string): Meeting["roleSlots"][number] {
  return {
    id,
    slotLabel: roleName,
    sortOrder: 1,
    assignedStudentId: null,
    assignedStudent: null,
    roleDefinition: {
      id: `${id}-definition`,
      name: roleName,
      isActive: true
    },
    score: null
  };
}

function studentFixture(): NonNullable<Meeting["roleSlots"][number]["assignedStudent"]> {
  return {
    id: "student-1",
    grade: "7",
    programLevel: "SENIOR",
    bandLevel: "White",
    user: {
      id: "student-user-1",
      email: "student@example.com",
      firstName: "Alex",
      lastName: "Student",
      role: "STUDENT"
    }
  };
}
