import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMeetingsOverviewResponse, type Meeting } from "../src/client/api";
import { MeetingEditForm } from "../src/client/components/MeetingWorkspace";
import { PortalRootErrorBoundary, WorkspaceErrorBoundary } from "../src/client/components/PortalErrorBoundary";
import { dateInputValue, formatDate } from "../src/client/components/portalShared";

const meeting = meetingFixture();
const editMarkup = renderToStaticMarkup(
  <MeetingEditForm meeting={meeting} clubs={[meeting.club]} isSubmitting={false} onSave={() => undefined} />
);

assert.match(editMarkup, /value="2026-08-15"/, "Edit Meeting renders a valid date input without a runtime exception.");
assert.match(editMarkup, /value="Saturday Meeting"/, "Edit Meeting initializes the selected meeting title.");

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

console.log("Client reliability regression tests passed.");

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
