import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminOverview,
  addMeetingRoleSlot,
  assignClubFacilitator,
  assignMeetingSlot,
  BandDocument,
  BandRequirement,
  backfillPreviousBandRequirements,
  claimMeetingSlot,
  createBandDocument,
  createBandRequirement,
  createCentre,
  createClub,
  createMeeting,
  createMember,
  createResourceLink,
  createRoleDefinition,
  createUser,
  deleteDemoUser,
  deleteBandDocument,
  deleteBandRequirement,
  deleteResourceLink,
  deleteRoleDefinition,
  deleteSampleFeedback,
  deleteSampleUsers,
  downloadAgenda,
  editMeetingRoleSlot,
  fetchStudentProgressForManager,
  FeedbackReportEntry,
  getAdminOverview,
  getBandDocuments,
  getBandRequirements,
  getFeedbackReport,
  getMemberDetail,
  getMembers,
  getMeetingsOverview,
  getResourceLinks,
  getRoleDefinitions,
  Meeting,
  MemberDetail,
  MemberListEntry,
  MembersResponse,
  MeetingsOverview,
  permanentlyDeleteMember,
  PortalUser,
  Role,
  saveStudentMeetingFeedback,
  removeMeetingRoleSlot,
  removeClubFacilitator,
  releaseMeetingSlot,
  resetDemoMeetingData,
  resetUserPassword,
  ResourceLink,
  RoleDefinition,
  setCentreActive,
  setClubActive,
  setMemberActive,
  setUserActive,
  StudentProgress,
  toggleMeetingLock,
  updateBandDocument,
  updateBandRequirement,
  updateMember,
  updateMeetingDetails,
  updateResourceLink,
  updateRoleDefinition,
  updateStudentProfile,
  updateStudentRequirement,
  updateUser
} from "../api";
import {
  DataPanel,
  documentCategoryOptions,
  documentLink,
  formatBandLadder,
  formatCleanupSummary,
  formatDate,
  formatProgramLevel,
  formatResourceScope,
  formatRole,
  formatStudentClubs,
  formatStudentName,
  getNextBandLevel,
  HelpLabel,
  isDemoUser,
  isLeadershipMeetingRole,
  isStudentInClub,
  programLevelOptions,
  ResourceActions,
  ResourcePanel,
  resourceCategoryOptions,
  resourceIdFromHash,
  resourcesForRequirement,
  resourcesForRole,
  resourcesForRoleName,
  roleDefinitionsForMeeting,
  roleDefinitionsForSlot,
  roleSlotName,
  splitDisplayName,
  StatusBadge,
  SummaryTile,
  bandLevelOptions
} from "./portalShared";
export function FeedbackReportPanel() {
  const [feedback, setFeedback] = useState<FeedbackReportEntry[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refreshFeedback() {
    setError("");
    setIsLoading(true);

    try {
      const result = await getFeedbackReport();
      setFeedback(result.feedback);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load feedback report.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshFeedback();
  }, []);

  return (
    <section className="feedback-report" id="feedback" aria-label="Facilitator feedback report">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Feedback</p>
          <h2>Facilitator Feedback for Students</h2>
        </div>
        <button type="button" onClick={() => refreshFeedback()} disabled={isLoading}>Refresh</button>
      </div>
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {isLoading ? <p className="loading-state">Loading feedback...</p> : null}
      {!isLoading && !feedback.length ? <p className="loading-state">No facilitator feedback yet.</p> : null}
      {feedback.length ? (
        <div className="feedback-table-wrap">
          <table className="feedback-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Club</th>
                <th>Meeting</th>
                <th>Related Roles</th>
                <th>Score</th>
                <th>Feedback</th>
                <th>Evaluator</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.studentName}</td>
                  <td>{entry.clubName}</td>
                  <td>{formatDate(entry.meetingDate)}<span>{entry.meetingTitle}</span></td>
                  <td>{entry.roleName}</td>
                  <td>{entry.score}/100</td>
                  <td>{entry.feedback || "No comment entered."}</td>
                  <td>{entry.evaluatorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function AddRoleSlotControls({
  roleDefinitions,
  isSubmitting,
  onAddSlot
}: {
  roleDefinitions: MeetingsOverview["roleDefinitions"];
  isSubmitting: boolean;
  onAddSlot: (roleDefinitionId: string, slotLabel?: string) => void;
}) {
  const [roleDefinitionId, setRoleDefinitionId] = useState(roleDefinitions[0]?.id ?? "");
  const [slotLabel, setSlotLabel] = useState("");

  useEffect(() => {
    if (!roleDefinitionId && roleDefinitions[0]?.id) {
      setRoleDefinitionId(roleDefinitions[0].id);
    }
  }, [roleDefinitionId, roleDefinitions]);

  function handleAddSlot() {
    if (!roleDefinitionId) {
      return;
    }

    onAddSlot(roleDefinitionId, slotLabel.trim() || undefined);
    setSlotLabel("");
  }

  return (
    <div className="slot-editor add-slot-editor">
      <label>
        Add Role
        <select value={roleDefinitionId} onChange={(event) => setRoleDefinitionId(event.currentTarget.value)} disabled={isSubmitting}>
          {roleDefinitions.map((roleDefinition) => (
            <option key={roleDefinition.id} value={roleDefinition.id}>{roleDefinition.name}</option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={slotLabel} placeholder="Optional custom label" onChange={(event) => setSlotLabel(event.currentTarget.value)} disabled={isSubmitting} />
      </label>
      <button type="button" onClick={handleAddSlot} disabled={isSubmitting || !roleDefinitionId}>Add Slot</button>
    </div>
  );
}

function ManageRoleSlotRow({
  slot,
  roleDefinitions,
  students,
  resources,
  onSelectResource,
  isSubmitting,
  onEditSlot,
  onAssign,
  onRemoveSlot
}: {
  slot: Meeting["roleSlots"][number];
  roleDefinitions: MeetingsOverview["roleDefinitions"];
  students: MeetingsOverview["students"];
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
  isSubmitting: boolean;
  onEditSlot: (payload: { roleDefinitionId?: string; slotLabel?: string; sortOrder?: number }) => void;
  onAssign: (studentId: string | null) => void;
  onRemoveSlot: () => void;
}) {
  const [roleDefinitionId, setRoleDefinitionId] = useState(slot.roleDefinition.id);
  const [slotLabel, setSlotLabel] = useState(slot.slotLabel || slot.roleDefinition.name);
  const [sortOrder, setSortOrder] = useState(String(slot.sortOrder));

  useEffect(() => {
    setRoleDefinitionId(slot.roleDefinition.id);
    setSlotLabel(slot.slotLabel || slot.roleDefinition.name);
    setSortOrder(String(slot.sortOrder));
  }, [slot.id, slot.roleDefinition.id, slot.roleDefinition.name, slot.slotLabel, slot.sortOrder]);

  function handleSaveSlot() {
    onEditSlot({
      roleDefinitionId,
      slotLabel: slotLabel.trim() || undefined,
      sortOrder: Number(sortOrder)
    });
  }

  function handleReleaseAssignment() {
    const assignedName = slot.assignedStudent ? formatStudentName(slot.assignedStudent) : "this student";

    if (window.confirm(`Release ${roleSlotName(slot)} from ${assignedName}? Another student will be able to claim it.`)) {
      onAssign(null);
    }
  }

  return (
    <article className="manager-role-row">
      <div>
        <strong>
          <HelpLabel
            label={roleSlotName(slot)}
            resources={resourcesForRole(resources, slot)}
            onSelectResource={onSelectResource}
          />
        </strong>
        <span>{slot.assignedStudent ? formatStudentName(slot.assignedStudent) : "None"}</span>
      </div>
      <label>
        Assigned Member
        <select value={slot.assignedStudentId ?? ""} onChange={(event) => onAssign(event.target.value || null)} disabled={isSubmitting}>
          <option value="">None</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>{formatStudentName(student)}</option>
          ))}
        </select>
      </label>
      <label>
        Role
        <select value={roleDefinitionId} onChange={(event) => setRoleDefinitionId(event.currentTarget.value)} disabled={isSubmitting}>
          {roleDefinitions.map((roleDefinition) => (
            <option key={roleDefinition.id} value={roleDefinition.id}>{roleDefinition.name}</option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={slotLabel} onChange={(event) => setSlotLabel(event.currentTarget.value)} disabled={isSubmitting} />
      </label>
      <label>
        Order
        <input
          type="number"
          min="1"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.currentTarget.value)}
          disabled={isSubmitting}
        />
      </label>
      <button type="button" onClick={handleSaveSlot} disabled={isSubmitting || !roleDefinitionId || !sortOrder}>Update Slot</button>
      <button type="button" className="danger-action" onClick={handleReleaseAssignment} disabled={isSubmitting || !slot.assignedStudentId}>Release Role</button>
      <button type="button" className="danger-action" onClick={onRemoveSlot} disabled={isSubmitting || Boolean(slot.assignedStudentId || slot.score)}>Remove</button>
    </article>
  );
}

function StudentFeedbackRow({
  meeting,
  student,
  isSubmitting,
  onScore
}: {
  meeting: Meeting;
  student: MeetingsOverview["students"][number];
  isSubmitting: boolean;
  onScore: (studentId: string, roleSlotId: string | null, score: number, feedback?: string) => void;
}) {
  const existingFeedback = meeting.studentFeedbacks.find((entry) => entry.studentId === student.id);
  const assignedSlots = meeting.roleSlots.filter((slot) => slot.assignedStudentId === student.id);
  const [roleSlotId, setRoleSlotId] = useState(existingFeedback?.roleSlotId ?? "");
  const [score, setScore] = useState(String(existingFeedback?.score ?? ""));
  const [feedback, setFeedback] = useState(existingFeedback?.feedback ?? "");

  useEffect(() => {
    setRoleSlotId(existingFeedback?.roleSlotId ?? "");
    setScore(String(existingFeedback?.score ?? ""));
    setFeedback(existingFeedback?.feedback ?? "");
  }, [existingFeedback?.id, existingFeedback?.roleSlotId, existingFeedback?.score, existingFeedback?.feedback]);

  return (
    <article className="score-feedback-row">
      <div>
        <strong>{formatStudentName(student)}</strong>
        <span>Roles: {assignedSlots.map(roleSlotName).join(", ") || "No role assigned"}</span>
      </div>
      <label>
        Related Role
        <select value={roleSlotId} disabled={isSubmitting} onChange={(event) => setRoleSlotId(event.currentTarget.value)}>
          <option value="">General meeting feedback</option>
          {assignedSlots.map((slot) => (
            <option key={slot.id} value={slot.id}>{roleSlotName(slot)}</option>
          ))}
        </select>
      </label>
      <label>
        Score
        <input type="number" min="0" max="100" value={score} placeholder="0-100" disabled={isSubmitting} onChange={(event) => setScore(event.currentTarget.value)} />
      </label>
      <label>
        Feedback / Comment
        <textarea
          value={feedback}
          placeholder="Write facilitator feedback"
          disabled={isSubmitting}
          onChange={(event) => setFeedback(event.currentTarget.value)}
        />
      </label>
      <button type="button" onClick={() => onScore(student.id, roleSlotId || null, Number(score), feedback)} disabled={isSubmitting || score === ""}>Save Feedback</button>
    </article>
  );
}

