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
  deleteMeeting,
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
type MeetingMode = "view" | "book" | "manage" | "score" | "edit";

const meetingTemplates = [
  "Junior Regular Meeting",
  "Senior Regular Meeting",
  "Debate Meeting",
  "Town Hall Leadership Challenge",
  "Competition Meeting",
  "Special Event"
];

export function MeetingWorkspace({ user }: { user: PortalUser }) {
  const [overview, setOverview] = useState<MeetingsOverview | null>(null);
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLink | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [meetingMode, setMeetingMode] = useState<MeetingMode>("view");
  const [meetingPendingDeletion, setMeetingPendingDeletion] = useState<Meeting | null>(null);
  const canManageMeetings = user.role === "ADMIN" || user.role === "FACILITATOR";
  const selectedMeeting = overview?.meetings.find((meeting) => meeting.id === selectedMeetingId) ?? overview?.meetings[0] ?? null;
  const selectedMeetingStudents = selectedMeeting && overview
    ? overview.students.filter((student) => isStudentInClub(student, selectedMeeting.clubId))
    : [];

  async function refreshMeetings() {
    const [data, resourceData] = await Promise.all([
      getMeetingsOverview(),
      getResourceLinks()
    ]);
    setOverview(data);
    setResources(resourceData.resources);
    setSelectedMeetingId((currentMeetingId) => {
      if (currentMeetingId && data.meetings.some((meeting) => meeting.id === currentMeetingId)) {
        return currentMeetingId;
      }

      return data.meetings[0]?.id ?? "";
    });
  }

  useEffect(() => {
    refreshMeetings()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load meetings."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleCreateMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      await createMeeting({
        clubId: String(formData.get("clubId") || ""),
        title: String(formData.get("title") || ""),
        templateType: String(formData.get("templateType") || ""),
        meetingDate: String(formData.get("meetingDate") || ""),
        startTime: String(formData.get("startTime") || ""),
        location: String(formData.get("location") || "")
      });
      form.reset();
      await refreshMeetings();
      setStatus("Meeting created.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create meeting.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateMeeting(action: () => Promise<{ meeting: Meeting }>, successMessage: string) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await action();
      setOverview((current) => current ? {
        ...current,
        meetings: current.meetings.map((meeting) => meeting.id === result.meeting.id ? result.meeting : meeting)
      } : current);
      setSelectedMeetingId(result.meeting.id);
      setStatus(successMessage);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update meeting.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runDownload(action: () => Promise<void>) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await action();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download agenda.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteMeeting() {
    if (!meetingPendingDeletion) {
      return;
    }

    const meetingId = meetingPendingDeletion.id;
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await deleteMeeting(meetingId);
      setOverview((current) => current ? {
        ...current,
        meetings: current.meetings.filter((meeting) => meeting.id !== meetingId)
      } : current);
      setSelectedMeetingId((current) => current === meetingId ? "" : current);
      setMeetingMode("view");
      setMeetingPendingDeletion(null);
      setStatus("Meeting deleted successfully.");
    } catch (deleteError) {
      setMeetingPendingDeletion(null);
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete meeting.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="meeting-workspace" id="meetings" aria-label="Meeting and role workspace">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Meetings</p>
          <h2>Meetings</h2>
        </div>
        <button type="button" onClick={() => refreshMeetings()} disabled={isLoading}>Refresh</button>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      {canManageMeetings ? (
        <form className="meeting-form" onSubmit={handleCreateMeeting}>
          <h3>Create Meeting</h3>
          <div className="form-two-column">
            <label>
              Club
              <select name="clubId" required>
                <option value="">Select club</option>
                {overview?.clubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            </label>
            <label>Title<input name="title" placeholder="Senior Regular Meeting" required /></label>
            <label>Date<input name="meetingDate" type="date" required /></label>
            <label>
              Template
              <select name="templateType" defaultValue="">
                <option value="">Regular Meeting</option>
                {meetingTemplates.map((template) => <option key={template}>{template}</option>)}
              </select>
            </label>
            <label>Start Time<input name="startTime" placeholder="Optional" /></label>
            <label>Location or Link<input name="location" placeholder="Ottawa Centre or online link" /></label>
            <p className="wide-field field-note">All standard iLEAP role slots are added automatically when the meeting is created.</p>
          </div>
          <button type="submit" disabled={isSubmitting || !overview?.clubs.length}>Create Meeting</button>
        </form>
      ) : null}

      {user.role === "ADMIN" ? (
        <RoleDefinitionManagementPanel onChanged={() => refreshMeetings()} />
      ) : null}

      <MeetingList
        meetings={overview?.meetings ?? []}
        user={user}
        isLoading={isLoading}
        isSubmitting={isSubmitting}
        selectedMeetingId={selectedMeeting?.id ?? ""}
        onSelect={(meeting, mode) => {
          setSelectedMeetingId(meeting.id);
          setMeetingMode(mode);
          setStatus("");
          setError("");
        }}
        onAgendaDownload={(meeting) => runDownload(() => downloadAgenda(meeting.id))}
        onDeleteRequest={(meeting) => {
          setMeetingPendingDeletion(meeting);
          setStatus("");
          setError("");
        }}
      />

      {selectedMeeting ? (
        <div className="meeting-detail-panel">
          <div className="meeting-mode-tabs" aria-label="Meeting workflow">
            <button type="button" className={meetingMode === "view" ? "is-active" : ""} onClick={() => setMeetingMode("view")}>View</button>
            <button type="button" className={meetingMode === "book" ? "is-active" : ""} onClick={() => setMeetingMode("book")}>Book Roles</button>
            {canManageMeetings ? <button type="button" className={meetingMode === "edit" ? "is-active" : ""} onClick={() => setMeetingMode("edit")}>Edit Meeting</button> : null}
            {canManageMeetings ? <button type="button" className={meetingMode === "manage" ? "is-active" : ""} onClick={() => setMeetingMode("manage")}>Manage Roles</button> : null}
            {canManageMeetings ? <button type="button" className={meetingMode === "score" ? "is-active" : ""} onClick={() => setMeetingMode("score")}>Score Feedback</button> : null}
          </div>

          {meetingMode === "view" ? <MeetingView meeting={selectedMeeting} user={user} resources={resources} onSelectResource={setSelectedResource} /> : null}
          {meetingMode === "book" ? (
            <BookRoles
              meeting={selectedMeeting}
              user={user}
              resources={resources}
              onSelectResource={setSelectedResource}
              isSubmitting={isSubmitting}
              onClaim={(slotId) => updateMeeting(() => claimMeetingSlot(selectedMeeting.id, slotId), "Role claimed.")}
              onRelease={(slotId) => updateMeeting(() => releaseMeetingSlot(selectedMeeting.id, slotId), "Role released.")}
            />
          ) : null}
          {canManageMeetings && meetingMode === "edit" && overview ? (
            <EditMeeting
              meeting={selectedMeeting}
              clubs={overview.clubs}
              isSubmitting={isSubmitting}
              onSave={(payload) => updateMeeting(() => updateMeetingDetails(selectedMeeting.id, payload), "Meeting updated.")}
            />
          ) : null}
          {canManageMeetings && meetingMode === "manage" && overview ? (
            <ManageRoles
              meeting={selectedMeeting}
              roleDefinitions={overview.roleDefinitions}
              students={selectedMeetingStudents}
              resources={resources}
              onSelectResource={setSelectedResource}
              isSubmitting={isSubmitting}
              onAddSlot={(roleDefinitionId, slotLabel) => updateMeeting(() => addMeetingRoleSlot(selectedMeeting.id, { roleDefinitionId, slotLabel }), "Role slot added.")}
              onAssign={(slotId, studentId) => updateMeeting(() => assignMeetingSlot(selectedMeeting.id, slotId, studentId), studentId ? "Role assignment updated." : "Role released.")}
              onEditSlot={(slotId, payload) => updateMeeting(() => editMeetingRoleSlot(selectedMeeting.id, slotId, payload), "Role slot updated.")}
              onRemoveSlot={(slotId) => updateMeeting(() => removeMeetingRoleSlot(selectedMeeting.id, slotId), "Role slot removed.")}
              onToggleLock={() => updateMeeting(() => toggleMeetingLock(selectedMeeting.id), selectedMeeting.isRoleLocked ? "Roles reopened." : "Roles locked.")}
            />
          ) : null}
          {canManageMeetings && meetingMode === "score" ? (
            <ScoreFeedback
              meeting={selectedMeeting}
              students={selectedMeetingStudents}
              isSubmitting={isSubmitting}
              onScore={(studentId, roleSlotId, score, feedback) => updateMeeting(
                () => saveStudentMeetingFeedback(selectedMeeting.id, { studentId, roleSlotId, score, feedback }),
                "Feedback saved."
              )}
            />
          ) : null}
        </div>
      ) : null}

      {canManageMeetings && overview?.students.length ? (
        <RequirementManagementPanel
          user={user}
          students={overview.students}
          resources={resources}
          onSelectResource={setSelectedResource}
          onUpdated={() => refreshMeetings()}
        />
      ) : null}
      <ResourcePanel resource={selectedResource} onClose={() => setSelectedResource(null)} />
      {meetingPendingDeletion ? (
        <DeleteMeetingDialog
          meeting={meetingPendingDeletion}
          isSubmitting={isSubmitting}
          onCancel={() => setMeetingPendingDeletion(null)}
          onConfirm={handleDeleteMeeting}
        />
      ) : null}
    </section>
  );
}

function RoleDefinitionManagementPanel({ onChanged }: { onChanged: () => void }) {
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingRoleDefinition, setEditingRoleDefinition] = useState<RoleDefinition | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refreshRoleDefinitions() {
    const data = await getRoleDefinitions();
    setRoleDefinitions(data.roleDefinitions);
  }

  useEffect(() => {
    setIsLoading(true);
    refreshRoleDefinitions()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load role types."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = roleDefinitionPayloadFromForm(form);

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      if (editingRoleDefinition) {
        await updateRoleDefinition(editingRoleDefinition.id, payload);
        setStatus("Role type updated.");
      } else {
        await createRoleDefinition(payload);
        form.reset();
        setStatus("Role type added.");
      }

      setEditingRoleDefinition(null);
      setIsOpen(false);
      await refreshRoleDefinitions();
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save role type.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(roleDefinition: RoleDefinition) {
    if (!window.confirm(`Remove ${roleDefinition.name}? Existing meetings will be preserved; role types already used by meetings will be archived.`)) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await deleteRoleDefinition(roleDefinition.id);
      setStatus(result.message || (result.deleted ? "Role type deleted." : "Role type archived."));
      await refreshRoleDefinitions();
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove role type.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="role-definition-manager" aria-label="Speaking role type management">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Meeting Setup</p>
          <h3>Speaking Role Types</h3>
        </div>
        <button type="button" onClick={() => {
          setEditingRoleDefinition(null);
          setIsOpen((current) => !current);
        }}>
          {isOpen ? "Close" : "Add Role Type"}
        </button>
      </div>
      <p className="field-note">Manage the role types that can be added to Junior and Senior meeting role slots.</p>
      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {isOpen || editingRoleDefinition ? (
        <RoleDefinitionForm
          key={editingRoleDefinition?.id ?? "new-role-definition"}
          roleDefinition={editingRoleDefinition}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onCancel={() => {
            setEditingRoleDefinition(null);
            setIsOpen(false);
          }}
        />
      ) : null}
      {isLoading ? <p className="loading-state">Loading role types...</p> : null}
      <div className="role-definition-table-wrap">
        <table className="role-definition-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Program</th>
              <th>Level</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roleDefinitions.map((roleDefinition) => (
              <tr key={roleDefinition.id} className={!roleDefinition.isActive ? "is-archived" : ""}>
                <td>
                  <strong>{roleDefinition.name}</strong>
                  <span>{roleDefinition.description || "No description entered."}</span>
                </td>
                <td>{roleDefinition.category || "Speaking Role"}</td>
                <td>{roleDefinition.programLevel ? formatProgramLevel(roleDefinition.programLevel) : "All programs"}</td>
                <td>{roleDefinition.level || "All levels"}</td>
                <td>{roleDefinition.isActive ? "Active" : "Archived"}</td>
                <td>
                  <div className="resource-actions">
                    <button type="button" onClick={() => {
                      setEditingRoleDefinition(roleDefinition);
                      setIsOpen(false);
                    }} disabled={isSubmitting}>Edit</button>
                    <button type="button" className="danger-action" onClick={() => handleRemove(roleDefinition)} disabled={isSubmitting}>
                      {roleDefinition.isActive ? "Remove" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!roleDefinitions.length && !isLoading ? <p className="loading-state">No role types have been configured.</p> : null}
    </section>
  );
}

function RoleDefinitionForm({
  roleDefinition,
  isSubmitting,
  onSubmit,
  onCancel
}: {
  roleDefinition: RoleDefinition | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className="role-definition-form" onSubmit={onSubmit}>
      <label>Name<input name="name" defaultValue={roleDefinition?.name ?? ""} placeholder="Prepared Speech" required /></label>
      <label>
        Category
        <input name="category" defaultValue={roleDefinition?.category ?? "Speaking Role"} placeholder="Speaking Role" required />
      </label>
      <label>
        Program
        <select name="programLevel" defaultValue={roleDefinition?.programLevel ?? ""}>
          <option value="">All programs</option>
          {programLevelOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>Level<input name="level" defaultValue={roleDefinition?.level ?? ""} placeholder="Optional syllabus level" /></label>
      <label>Sort Order<input name="sortOrder" type="number" min="0" defaultValue={roleDefinition?.sortOrder ?? 0} /></label>
      <label className="checkbox-field">
        <input name="isActive" type="checkbox" defaultChecked={roleDefinition?.isActive ?? true} />
        Active
      </label>
      <label className="wide-field">Description<textarea name="description" defaultValue={roleDefinition?.description ?? ""} rows={3} placeholder="How this role is used in meetings" /></label>
      <div className="form-actions wide-field">
        <button type="submit" disabled={isSubmitting}>{roleDefinition ? "Save Role Type" : "Add Role Type"}</button>
        <button type="button" className="secondary-action" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
      </div>
    </form>
  );
}

function roleDefinitionPayloadFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);

  return {
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    category: String(formData.get("category") || "Speaking Role"),
    programLevel: String(formData.get("programLevel") || "") || null,
    level: String(formData.get("level") || "") || null,
    sortOrder: Number(formData.get("sortOrder") || 0),
    isActive: formData.get("isActive") === "on"
  };
}

function MeetingList({
  meetings,
  user,
  isLoading,
  isSubmitting,
  selectedMeetingId,
  onSelect,
  onAgendaDownload,
  onDeleteRequest
}: {
  meetings: Meeting[];
  user: PortalUser;
  isLoading: boolean;
  isSubmitting: boolean;
  selectedMeetingId: string;
  onSelect: (meeting: Meeting, mode: MeetingMode) => void;
  onAgendaDownload: (meeting: Meeting) => void;
  onDeleteRequest: (meeting: Meeting) => void;
}) {
  const canManage = user.role === "ADMIN" || user.role === "FACILITATOR";

  return (
    <div className="meeting-list-panel">
      <h3>{canManage ? "Meetings" : "My Club Meetings"}</h3>
      {isLoading ? <p className="loading-state">Loading meetings...</p> : null}
      {!isLoading && !meetings.length ? <p className="loading-state">No meetings yet.</p> : null}
      {meetings.length ? (
        <div className="meeting-table-wrap">
          <table className="meeting-table">
            <thead>
              <tr>
                <th>Meeting</th>
                <th>Club</th>
                <th>Date</th>
                <th>Time</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((meeting) => (
                <tr key={meeting.id} className={meeting.id === selectedMeetingId ? "is-selected" : ""}>
                  <td>{meeting.title}</td>
                  <td>{meeting.club.name}</td>
                  <td>{formatDate(meeting.meetingDate)}</td>
                  <td>{meeting.startTime || "Optional"}</td>
                  <td>{meeting.location || "None"}</td>
                  <td><StatusText isLocked={meeting.isRoleLocked} /></td>
                  <td>
                    <div className="meeting-row-actions">
                      <button type="button" onClick={() => onSelect(meeting, "view")}>View</button>
                      <button type="button" onClick={() => onSelect(meeting, "book")}>Book Roles</button>
                      <button type="button" onClick={() => onAgendaDownload(meeting)} disabled={isSubmitting}>Download Agenda</button>
                      {canManage ? <button type="button" onClick={() => onSelect(meeting, "edit")}>Edit Meeting</button> : null}
                      {canManage ? <button type="button" onClick={() => onSelect(meeting, "manage")}>Manage Roles</button> : null}
                      {canManage ? <button type="button" onClick={() => onSelect(meeting, "score")}>Score Feedback</button> : null}
                      {canManage ? <button type="button" className="danger-action" onClick={() => onDeleteRequest(meeting)} disabled={isSubmitting}>Delete</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function DeleteMeetingDialog({
  meeting,
  isSubmitting,
  onCancel,
  onConfirm
}: {
  meeting: Meeting;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="resource-panel-backdrop" role="presentation" onClick={() => !isSubmitting && onCancel()}>
      <section
        className="resource-panel meeting-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-delete-title"
        aria-describedby="meeting-delete-description"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isSubmitting) {
            onCancel();
          }
        }}
      >
        <div>
          <p className="eyebrow">Permanent deletion</p>
          <h3 id="meeting-delete-title">Delete this meeting permanently?</h3>
        </div>
        <p><strong>{meeting.title}</strong> - {formatDate(meeting.meetingDate)}</p>
        <p id="meeting-delete-description">This action cannot be undone. Any roles, assignments, feedback, agenda information, attendance, or other records associated with this meeting may also be removed.</p>
        <div className="meeting-delete-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} autoFocus>Cancel</button>
          <button type="button" className="danger-action" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Deleting..." : "Delete Meeting"}
          </button>
        </div>
      </section>
    </div>
  );
}

function MeetingView({
  meeting,
  user,
  resources,
  onSelectResource
}: {
  meeting: Meeting;
  user: PortalUser;
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
}) {
  return (
    <section className="meeting-mode-section" aria-label="Meeting view">
      <MeetingSummary meeting={meeting} />
      <RoleAssignmentTable meeting={meeting} user={user} resources={resources} onSelectResource={onSelectResource} />
    </section>
  );
}

function BookRoles({
  meeting,
  user,
  resources,
  onSelectResource,
  isSubmitting,
  onClaim,
  onRelease
}: {
  meeting: Meeting;
  user: PortalUser;
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
  isSubmitting: boolean;
  onClaim: (slotId: string) => void;
  onRelease: (slotId: string) => void;
}) {
  const claimedCount = user.role === "STUDENT"
    ? meeting.roleSlots.filter((slot) => slot.assignedStudent?.user.id === user.id).length
    : 0;
  const hasClaimedLeadershipRole = user.role === "STUDENT"
    ? meeting.roleSlots.some((slot) => slot.assignedStudent?.user.id === user.id && isLeadershipMeetingRole(slot))
    : false;
  const openSlots = meeting.roleSlots.filter((slot) => !slot.assignedStudentId);
  const canBook = user.role === "STUDENT" && !meeting.isRoleLocked;

  return (
    <section className="meeting-mode-section" aria-label="Book roles">
      <MeetingSummary meeting={meeting} />
      <p className="field-note">You can claim up to 2 roles per meeting, including a maximum of 1 leadership role.</p>
      {meeting.isRoleLocked ? <p className="admin-status is-error">Role booking is locked for this meeting.</p> : null}
      {user.role !== "STUDENT" ? <p className="loading-state">Managers can review booking availability here. Use Manage Roles to assign students.</p> : null}
      <ul className="booking-list">
        {meeting.roleSlots.map((slot) => {
          const assignedName = slot.assignedStudent ? formatStudentName(slot.assignedStudent) : "";
          const isOwnRole = slot.assignedStudent?.user.id === user.id;
          const isLeadershipRole = isLeadershipMeetingRole(slot);
          const isAvailable = canBook && !slot.assignedStudentId && claimedCount < 2 && (!isLeadershipRole || !hasClaimedLeadershipRole);
          const canRelease = canBook && isOwnRole;

          return (
            <li key={slot.id} className={!slot.assignedStudentId ? "is-open" : ""}>
              <div>
                <strong>
                  <HelpLabel
                    label={roleSlotName(slot)}
                    resources={resourcesForRole(resources, slot)}
                    onSelectResource={onSelectResource}
                  />
                </strong>
                <span>{assignedName ? `Assigned to ${assignedName}` : "Available"}</span>
              </div>
              {isOwnRole ? <em>Claimed</em> : null}
              {!slot.assignedStudentId ? (
                <button type="button" onClick={() => onClaim(slot.id)} disabled={!isAvailable || isSubmitting}>
                  Claim
                </button>
              ) : null}
              {isOwnRole ? (
                <button
                  type="button"
                  className="danger-action"
                  onClick={() => {
                    if (window.confirm(`Release ${roleSlotName(slot)}? Another student will be able to claim it.`)) {
                      onRelease(slot.id);
                    }
                  }}
                  disabled={!canRelease || isSubmitting}
                >
                  Release
                </button>
              ) : null}
              {slot.assignedStudentId && !isOwnRole ? <em>Not available</em> : null}
            </li>
          );
        })}
      </ul>
      {!openSlots.length ? <p className="loading-state">No open roles are available for this meeting.</p> : null}
      {user.role === "STUDENT" && claimedCount >= 2 ? <p className="admin-status is-success">You have claimed 2 roles for this meeting.</p> : null}
      {user.role === "STUDENT" && claimedCount < 2 && hasClaimedLeadershipRole ? <p className="admin-status is-success">You have claimed your leadership role for this meeting.</p> : null}
    </section>
  );
}

function ManageRoles({
  meeting,
  roleDefinitions,
  students,
  resources,
  onSelectResource,
  isSubmitting,
  onAddSlot,
  onAssign,
  onEditSlot,
  onRemoveSlot,
  onToggleLock
}: {
  meeting: Meeting;
  roleDefinitions: MeetingsOverview["roleDefinitions"];
  students: MeetingsOverview["students"];
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
  isSubmitting: boolean;
  onAddSlot: (roleDefinitionId: string, slotLabel?: string) => void;
  onAssign: (slotId: string, studentId: string | null) => void;
  onEditSlot: (slotId: string, payload: { roleDefinitionId?: string; slotLabel?: string; sortOrder?: number }) => void;
  onRemoveSlot: (slotId: string) => void;
  onToggleLock: () => void;
}) {
  const availableRoleDefinitions = roleDefinitionsForMeeting(roleDefinitions, meeting);

  return (
    <section className="meeting-mode-section" aria-label="Manage roles">
      <MeetingSummary meeting={meeting} />
      <div className="manager-toolbar">
        <button type="button" onClick={onToggleLock} disabled={isSubmitting}>{meeting.isRoleLocked ? "Unlock Role Claims" : "Lock Role Claims"}</button>
        <StatusText isLocked={meeting.isRoleLocked} />
      </div>
      <AddRoleSlotControls roleDefinitions={availableRoleDefinitions} isSubmitting={isSubmitting} onAddSlot={onAddSlot} />
      <div className="manager-role-list">
        {meeting.roleSlots.map((slot) => (
          <ManageRoleSlotRow
            key={slot.id}
            slot={slot}
            roleDefinitions={roleDefinitionsForSlot(availableRoleDefinitions, slot)}
            students={students}
            resources={resources}
            onSelectResource={onSelectResource}
            isSubmitting={isSubmitting}
            onAssign={(studentId) => onAssign(slot.id, studentId)}
            onEditSlot={(payload) => onEditSlot(slot.id, payload)}
            onRemoveSlot={() => onRemoveSlot(slot.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ScoreFeedback({
  meeting,
  students,
  isSubmitting,
  onScore
}: {
  meeting: Meeting;
  students: MeetingsOverview["students"];
  isSubmitting: boolean;
  onScore: (studentId: string, roleSlotId: string | null, score: number, feedback?: string) => void;
}) {
  const assignedStudentIds = new Set(meeting.roleSlots.flatMap((slot) => slot.assignedStudentId ? [slot.assignedStudentId] : []));
  const feedbackStudents = students.filter((student) => assignedStudentIds.has(student.id));

  return (
    <section className="meeting-mode-section" aria-label="Score feedback">
      <MeetingSummary meeting={meeting} />
      <div className="feedback-context">
        <strong>{meeting.title}</strong>
        <span>{formatDate(meeting.meetingDate)} - {meeting.club.name}</span>
      </div>
      {!feedbackStudents.length ? <p className="loading-state">Assign students to roles before scoring feedback.</p> : null}
      <div className="score-feedback-list">
        {feedbackStudents.map((student) => (
          <StudentFeedbackRow
            key={student.id}
            meeting={meeting}
            student={student}
            isSubmitting={isSubmitting}
            onScore={onScore}
          />
        ))}
      </div>
    </section>
  );
}

function EditMeeting({
  meeting,
  clubs,
  isSubmitting,
  onSave
}: {
  meeting: Meeting;
  clubs: MeetingsOverview["clubs"];
  isSubmitting: boolean;
  onSave: (payload: { clubId: string; title: string; templateType?: string; meetingDate: string; startTime?: string; location: string }) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    onSave({
      clubId: String(formData.get("clubId") || ""),
      title: String(formData.get("title") || ""),
      templateType: String(formData.get("templateType") || ""),
      meetingDate: String(formData.get("meetingDate") || ""),
      startTime: String(formData.get("startTime") || ""),
      location: String(formData.get("location") || "")
    });
  }

  return (
    <section className="meeting-mode-section" aria-label="Edit meeting">
      <MeetingSummary meeting={meeting} />
      <form className="meeting-form compact" onSubmit={handleSubmit}>
        <div className="form-two-column">
          <label>
            Club
            <select name="clubId" defaultValue={meeting.clubId} required>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>{club.name}</option>
              ))}
            </select>
          </label>
          <label>Title<input name="title" defaultValue={meeting.title} required /></label>
          <label>
            Template
            <select name="templateType" defaultValue={meeting.templateType}>
              <option value="">Regular Meeting</option>
              {meetingTemplates.map((template) => <option key={template}>{template}</option>)}
            </select>
          </label>
          <label>Date<input name="meetingDate" type="date" defaultValue={dateInputValue(meeting.meetingDate)} required /></label>
          <label>Time<input name="startTime" defaultValue={meeting.startTime} /></label>
          <label>Location or Link<input name="location" defaultValue={meeting.location ?? ""} /></label>
        </div>
        <button type="submit" disabled={isSubmitting}>Save Meeting</button>
      </form>
    </section>
  );
}

function MeetingSummary({ meeting }: { meeting: Meeting }) {
  return (
    <div className="meeting-summary">
      <div>
        <p className="eyebrow">{meeting.templateType}</p>
        <h3>{meeting.title}</h3>
        <p>{meeting.club.name} - {formatDate(meeting.meetingDate)}{meeting.startTime ? ` - ${meeting.startTime}` : ""}{meeting.location ? ` - ${meeting.location}` : ""}</p>
      </div>
      <StatusText isLocked={meeting.isRoleLocked} />
    </div>
  );
}

function RoleAssignmentTable({
  meeting,
  user,
  resources,
  onSelectResource
}: {
  meeting: Meeting;
  user: PortalUser;
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
}) {
  return (
    <div className="role-table-wrap">
      <table className="role-assignment-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Assigned Member</th>
            <th>Score</th>
            <th>Feedback</th>
          </tr>
        </thead>
        <tbody>
          {meeting.roleSlots.map((slot) => (
            <RoleAssignmentRow key={slot.id} slot={slot} user={user} resources={resources} onSelectResource={onSelectResource} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleAssignmentRow({
  slot,
  user,
  resources,
  onSelectResource
}: {
  slot: Meeting["roleSlots"][number];
  user: PortalUser;
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
}) {
  const canSeeScore = user.role !== "STUDENT" || slot.assignedStudent?.user.id === user.id;

  return (
    <tr>
      <td>
        <HelpLabel
          label={roleSlotName(slot)}
          resources={resourcesForRole(resources, slot)}
          onSelectResource={onSelectResource}
        />
      </td>
      <td>{slot.assignedStudent ? formatStudentName(slot.assignedStudent) : "None"}</td>
      <td>{canSeeScore && slot.score ? `${slot.score.score}/100` : "None"}</td>
      <td>{canSeeScore ? slot.score?.feedback || "None" : "None"}</td>
    </tr>
  );
}

function StatusText({ isLocked }: { isLocked: boolean }) {
  return <strong className={isLocked ? "lock-pill locked" : "lock-pill"}>{isLocked ? "Locked" : "Open"}</strong>;
}

function RequirementManagementPanel({
  user,
  students,
  resources,
  onSelectResource,
  onUpdated
}: {
  user: PortalUser;
  students: MeetingsOverview["students"];
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
  onUpdated: () => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refreshSelectedProgress() {
    if (!selectedStudentId) {
      return;
    }

    const updatedProgress = await fetchStudentProgressForManager(selectedStudentId);
    setProgress(updatedProgress);
  }

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    setIsLoading(true);
    setError("");
    refreshSelectedProgress()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load requirements."))
      .finally(() => setIsLoading(false));
  }, [selectedStudentId]);

  async function handleRequirementUpdate(requirementId: string, currentCount: number, isCompleted: boolean, notes?: string) {
    if (!selectedStudentId) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await updateStudentRequirement(selectedStudentId, requirementId, { currentCount, isCompleted, notes });
      await refreshSelectedProgress();
      setStatus(isCompleted ? "Requirement marked complete." : "Requirement completion undone.");
      onUpdated();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update requirement.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBackfillPreviousBands() {
    if (!selectedStudentId || !window.confirm("This will mark all requirements before the student's current band as completed. Continue?")) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await backfillPreviousBandRequirements(selectedStudentId);
      await refreshSelectedProgress();
      setStatus(`Previous band requirements backfilled. ${result.updatedCount} requirements marked complete.`);
      onUpdated();
    } catch (backfillError) {
      setError(backfillError instanceof Error ? backfillError.message : "Unable to backfill previous bands.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleProfileUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStudentId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const updatedProgress = await updateStudentProfile(selectedStudentId, {
        programLevel: String(formData.get("programLevel") || "SENIOR"),
        bandLevel: String(formData.get("bandLevel") || "White")
      });
      setProgress(updatedProgress);
      setStatus("Student program and band level updated.");
      onUpdated();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update student placement.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="requirement-manager" id="requirements">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Personal Tracking</p>
          <h3>Update Student Band Progress</h3>
        </div>
        <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
          {students.map((student) => (
            <option key={student.id} value={student.id}>{student.user.firstName} {student.user.lastName}</option>
          ))}
        </select>
      </div>
      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {isLoading ? <p className="loading-state">Loading requirements...</p> : null}
      {progress ? (
        <>
          {user.role === "ADMIN" ? (
            <BandRequirementDefinitionManager
              onChanged={() => {
                refreshSelectedProgress().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to refresh requirements."));
                onUpdated();
              }}
            />
          ) : null}
          <div className="student-context-card">
            <strong>{progress.student.user.firstName} {progress.student.user.lastName}</strong>
            <span>Program Level: {formatProgramLevel(progress.summary.programLevel)} - Current Band: {progress.summary.bandLevel} - Band Ladder: {formatBandLadder(progress.summary.programLevel)}</span>
          </div>
          {progress.summary.programLevelWarning ? <p className="admin-status is-error" role="alert">{progress.summary.programLevelWarning}</p> : null}
          <form className="student-placement-form" onSubmit={handleProfileUpdate}>
            <label>
              Program Level
              <select name="programLevel" defaultValue={progress.summary.programLevel ?? "SENIOR"}>
                {programLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Current Band Level
              <select name="bandLevel" defaultValue={progress.summary.bandLevel}>
                {bandLevelOptions.map((bandLevel) => (
                  <option key={bandLevel} value={bandLevel}>{bandLevel}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={isSubmitting}>Update Student</button>
            <button type="button" onClick={handleBackfillPreviousBands} disabled={isSubmitting || !progress.summary.programLevel}>
              Backfill Previous Bands
            </button>
          </form>
          <ul className="requirement-list manager">
            {progress.requirements.map((entry) => (
              <li key={entry.requirement.id} className={entry.isCompleted ? "is-complete" : ""}>
                <div>
                  <strong>
                    {entry.requirement.bandLevel}: {entry.requirement.requirementType} -{" "}
                    <HelpLabel
                      label={entry.requirement.name}
                      resources={resourcesForRequirement(resources, entry.requirement.id, entry.requirement.name)}
                      onSelectResource={onSelectResource}
                    />
                  </strong>
                  <span>{formatBandLadder(progress.summary.programLevel)} - {entry.requirement.description}</span>
                </div>
                <div className="requirement-controls">
                  <em>{entry.isCompleted ? "Completed" : "Not Completed"}</em>
                  <input
                    key={`${entry.requirement.id}-${entry.currentCount}-${entry.isCompleted}`}
                    type="number"
                    min="0"
                    max={entry.requirement.targetCount}
                    defaultValue={entry.currentCount}
                    disabled={isSubmitting}
                    onBlur={(event) => handleRequirementUpdate(entry.requirement.id, Number(event.currentTarget.value), Number(event.currentTarget.value) >= entry.requirement.targetCount)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRequirementUpdate(
                      entry.requirement.id,
                      entry.isCompleted ? 0 : entry.requirement.targetCount,
                      !entry.isCompleted,
                      entry.isCompleted ? "Completion undone by manager" : "Marked complete by manager"
                    )}
                    disabled={isSubmitting}
                  >
                    {entry.isCompleted ? "Undo Completion" : "Mark Complete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function BandRequirementDefinitionManager({ onChanged }: { onChanged: () => void }) {
  const [requirements, setRequirements] = useState<BandRequirement[]>([]);
  const [editingRequirement, setEditingRequirement] = useState<BandRequirement | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  async function refreshRequirements() {
    const result = await getBandRequirements();
    setRequirements(result.requirements);
  }

  useEffect(() => {
    refreshRequirements()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load band requirements."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = bandRequirementPayloadFromForm(form);
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      if (editingRequirement) {
        await updateBandRequirement(editingRequirement.id, payload);
        setEditingRequirement(null);
        setStatus("Band requirement updated.");
      } else {
        await createBandRequirement(payload);
        form.reset();
        setIsFormOpen(false);
        setStatus("Band requirement added.");
      }

      await refreshRequirements();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save band requirement.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(requirement: BandRequirement) {
    const confirmed = window.confirm(`Remove "${requirement.name}" from ${formatProgramLevel(requirement.programLevel)} ${requirement.bandLevel}? If students already have progress for it, it will be marked inactive instead of deleted.`);

    if (!confirmed) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await deleteBandRequirement(requirement.id);
      await refreshRequirements();
      onChanged();
      setStatus(result.message ?? (result.deleted ? "Band requirement deleted." : "Band requirement marked inactive."));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove band requirement.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="requirement-definition-manager" aria-label="Band requirement definition management">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Admin setup</p>
          <h3>Band Requirement Checklist Items</h3>
        </div>
        <button type="button" onClick={() => setIsFormOpen((isOpen) => !isOpen)} disabled={isSubmitting}>
          {isFormOpen ? "Cancel Requirement" : "Add Requirement"}
        </button>
      </div>
      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {isFormOpen || editingRequirement ? (
        <BandRequirementForm
          requirement={editingRequirement}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onCancel={() => {
            setEditingRequirement(null);
            setIsFormOpen(false);
          }}
        />
      ) : null}
      {isLoading ? <p className="loading-state">Loading band requirements...</p> : null}
      {!isLoading && requirements.length ? (
        <div className="requirement-definition-table-wrap">
          <table className="requirement-definition-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Band</th>
                <th>Requirement</th>
                <th>Type</th>
                <th>Target</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((requirement) => (
                <tr key={requirement.id} className={requirement.isActive === false ? "is-archived" : ""}>
                  <td>{formatProgramLevel(requirement.programLevel)}</td>
                  <td>{requirement.bandLevel}</td>
                  <td>{requirement.name}</td>
                  <td>{requirement.requirementType}</td>
                  <td>{requirement.targetCount}</td>
                  <td>{requirement.isActive === false ? "Inactive" : "Active"}</td>
                  <td>
                    <div className="meeting-row-actions">
                      <button type="button" className="text-action" onClick={() => setEditingRequirement(requirement)} disabled={isSubmitting}>Edit</button>
                      <button type="button" className="text-action danger-action" onClick={() => handleRemove(requirement)} disabled={isSubmitting}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function BandRequirementForm({
  requirement,
  isSubmitting,
  onSubmit,
  onCancel
}: {
  requirement: BandRequirement | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className="document-form requirement-definition-form" onSubmit={onSubmit}>
      <h3>{requirement ? "Edit Requirement" : "Add Requirement"}</h3>
      <label>
        Program
        <select name="programLevel" defaultValue={requirement?.programLevel ?? "SENIOR"}>
          {programLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        Band
        <select name="bandLevel" defaultValue={requirement?.bandLevel ?? "White"}>
          {bandLevelOptions.map((bandLevel) => <option key={bandLevel} value={bandLevel}>{bandLevel}</option>)}
        </select>
      </label>
      <label>Name<input name="name" defaultValue={requirement?.name ?? ""} required /></label>
      <label>Type<input name="requirementType" defaultValue={requirement?.requirementType ?? ""} placeholder="Speech, Role, Report" required /></label>
      <label>Target Count<input name="targetCount" type="number" min="1" defaultValue={requirement?.targetCount ?? 1} required /></label>
      <label>Sort Order<input name="sortOrder" type="number" min="0" defaultValue={requirement?.sortOrder ?? 0} required /></label>
      <label className="document-link-field">Description<textarea name="description" defaultValue={requirement?.description ?? ""} rows={3} required /></label>
      <label className="checkbox-label"><input name="isActive" type="checkbox" defaultChecked={requirement?.isActive !== false} /> Active</label>
      <div className="document-actions">
        <button type="submit" disabled={isSubmitting}>{requirement ? "Save Requirement" : "Add Requirement"}</button>
        <button type="button" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
      </div>
    </form>
  );
}

function bandRequirementPayloadFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);

  return {
    programLevel: String(formData.get("programLevel") || "SENIOR"),
    bandLevel: String(formData.get("bandLevel") || "White"),
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    requirementType: String(formData.get("requirementType") || ""),
    targetCount: Number(formData.get("targetCount") || 1),
    sortOrder: Number(formData.get("sortOrder") || 0),
    isActive: formData.get("isActive") === "on"
  };
}

