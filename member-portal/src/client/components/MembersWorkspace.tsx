import { FormEvent, useEffect, useRef, useState } from "react";
import {
  backfillPreviousBandRequirements,
  createMember,
  getMemberDetail,
  getMembers,
  MemberDetail,
  MemberListEntry,
  MembersResponse,
  permanentlyDeleteMember,
  PortalUser,
  Role,
  setUserActive,
  updateMember,
  updateUser,
  updateStudentRequirement
} from "../api";
import {
  bandLevelOptions,
  DataPanel,
  formatDate,
  formatProgramLevel,
  programLevelOptions,
  splitDisplayName,
  SummaryTile
} from "./portalShared";
export function MembersWorkspace({ user }: { user: PortalUser }) {
  const loadRequestId = useRef(0);
  const [data, setData] = useState<MembersResponse | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [editingMember, setEditingMember] = useState<MemberDetail | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [filters, setFilters] = useState({
    centreId: "",
    clubId: "",
    search: "",
    programLevel: "",
    currentBandLevel: "",
    status: "active",
    page: 1,
    pageSize: 25
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadMembers(nextFilters = filters) {
    const requestId = ++loadRequestId.current;
    setError("");
    setIsLoading(true);

    try {
      const result = await getMembers(nextFilters);
      if (requestId === loadRequestId.current) {
        setData(result);
      }
    } catch (loadError) {
      if (requestId === loadRequestId.current) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load members.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  function updateFilter(name: keyof typeof filters, value: string | number) {
    const nextFilters = { ...filters, [name]: value, page: name === "page" ? Number(value) : 1 };
    setFilters(nextFilters);
    loadMembers(nextFilters);
  }

  async function openDetail(studentId: string, targetId = "member-detail") {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await getMemberDetail(studentId);
      setDetail(result.member);
      window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Unable to load member detail.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateMemberStatus(member: MemberListEntry, isActive: boolean) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      if (!member.userId) {
        throw new Error("This member account cannot be activated or deactivated from the Members page.");
      }

      await setUserActive(member.userId, isActive);
      await loadMembers();
      if (detail?.id === member.id) {
        const result = await getMemberDetail(member.id);
        setDetail(result.member);
      }
      setStatus(isActive ? "Member reactivated." : "Member deactivated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update member status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startEditingMember(studentId: string) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await getMemberDetail(studentId);
      setEditingMember(result.member);
      setIsAddFormOpen(false);
      window.setTimeout(() => {
        document.getElementById("member-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Unable to load member for editing.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMemberFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const clubIds = formData.getAll("clubIds").map((value) => String(value)).filter(Boolean);

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const payload = {
        firstName: String(formData.get("firstName") || ""),
        lastName: String(formData.get("lastName") || ""),
        email: String(formData.get("email") || ""),
        grade: String(formData.get("grade") || ""),
        programLevel: String(formData.get("programLevel") || "SENIOR"),
        bandLevel: String(formData.get("bandLevel") || "White"),
        clubIds
      };

      if (editingMember) {
        if (user.role === "ADMIN") {
          if (!editingMember.userId) {
            throw new Error("This member account cannot be edited from the Members page.");
          }

          const role = String(formData.get("role") || "STUDENT") as Role;
          await updateUser(editingMember.userId, {
            ...payload,
            role,
            isActive: editingMember.isActive !== false,
            clubIds: role === "STUDENT" ? clubIds : [],
            facilitatorClubIds: role === "FACILITATOR" ? clubIds : []
          });
        } else {
          await updateMember(editingMember.id, {
            programLevel: payload.programLevel,
            bandLevel: payload.bandLevel
          });
        }
        setEditingMember(null);
        setDetail(null);
        setStatus("Member updated.");
      } else {
        await createMember({
          ...payload,
          password: String(formData.get("password") || "")
        });
        form.reset();
        setIsAddFormOpen(false);
        setStatus("Student member added.");
      }

      await loadMembers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save member.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteMember(member: MemberListEntry) {
    const confirmed = window.confirm(`Permanently delete ${member.displayName}? This will delete this member's club memberships, attendance, role claims, scores, facilitator feedback, band progress, parent links, and other owned records. This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await permanentlyDeleteMember(member.id);
      await loadMembers();
      if (detail?.id === member.id) {
        setDetail(null);
      }
      setStatus("Member permanently deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete member.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const clubs = data?.clubs.filter((club) => !filters.centreId || club.centreId === filters.centreId) ?? [];
  const assignableClubs = data?.clubs.filter((club) => club.isActive && club.centre?.isActive !== false) ?? [];

  return (
    <section className="members-workspace" id="members" aria-label="Members">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Members</p>
          <h2>Club Members</h2>
        </div>
        <div className="meeting-row-actions">
          <button type="button" onClick={() => setIsAddFormOpen((isOpen) => !isOpen)} disabled={isLoading || !assignableClubs.length}>
            {isAddFormOpen ? "Cancel" : "Add Member"}
          </button>
          <button type="button" onClick={() => loadMembers()} disabled={isLoading}>Refresh</button>
        </div>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      {isAddFormOpen || editingMember ? (
        <MemberForm
          key={editingMember?.id ?? "new-member"}
          member={editingMember}
          clubs={assignableClubs}
          viewerRole={user.role}
          isSubmitting={isSubmitting}
          onSubmit={handleMemberFormSubmit}
          onCancel={() => {
            setIsAddFormOpen(false);
            setEditingMember(null);
          }}
        />
      ) : null}

      <div className="member-filter-form">
        {user.role === "ADMIN" ? (
          <label>
            Centre
            <select value={filters.centreId} onChange={(event) => updateFilter("centreId", event.currentTarget.value)}>
              <option value="">All centres</option>
              {data?.centres.map((centre) => (
                <option key={centre.id} value={centre.id}>{centre.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Club
          <select value={filters.clubId} onChange={(event) => updateFilter("clubId", event.currentTarget.value)}>
            <option value="">All clubs</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>{club.name}</option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input value={filters.search} placeholder="Name or email" onChange={(event) => updateFilter("search", event.currentTarget.value)} />
        </label>
        <label>
          Program
          <select value={filters.programLevel} onChange={(event) => updateFilter("programLevel", event.currentTarget.value)}>
            <option value="">All programs</option>
            {programLevelOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Current Band
          <select value={filters.currentBandLevel} onChange={(event) => updateFilter("currentBandLevel", event.currentTarget.value)}>
            <option value="">All bands</option>
            {bandLevelOptions.map((bandLevel) => (
              <option key={bandLevel} value={bandLevel}>{bandLevel}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => updateFilter("status", event.currentTarget.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="">All</option>
          </select>
        </label>
      </div>

      {isLoading ? <p className="loading-state">Loading members...</p> : null}
      {!isLoading && !data?.members.length ? <p className="loading-state">No members found.</p> : null}

      {data?.members.length ? (
        <>
          <div className="feedback-table-wrap">
            <table className="feedback-table members-table">
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th>Email</th>
                  <th>Club</th>
                  <th>Program Level</th>
                  <th>Current Band</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={`${member.id}-${member.clubId ?? member.clubName}`}>
                    <td>{member.displayName}</td>
                    <td>{member.email ?? "Private"}</td>
                    <td>{member.clubName}</td>
                    <td>{formatProgramLevel(member.programLevel)}</td>
                    <td>{member.currentBandLevel}</td>
                    <td className="members-actions-cell">
                      <div className="member-row-actions">
                        <button type="button" onClick={() => openDetail(member.id)} disabled={isSubmitting}>View Details</button>
                        <button type="button" onClick={() => startEditingMember(member.id)} disabled={isSubmitting}>Edit Member</button>
                        <button type="button" onClick={() => openDetail(member.id, "member-progress")} disabled={isSubmitting}>View Progress</button>
                        <button type="button" onClick={() => openDetail(member.id, "member-feedback")} disabled={isSubmitting}>View Feedback</button>
                        {user.role === "ADMIN" ? (
                          <button type="button" className="danger-action" onClick={() => updateMemberStatus(member, member.isActive === false)} disabled={isSubmitting}>
                            {member.isActive === false ? "Reactivate" : "Deactivate"}
                          </button>
                        ) : null}
                        {user.role === "ADMIN" ? (
                          <button type="button" className="danger-action" onClick={() => deleteMember(member)} disabled={isSubmitting}>
                            Delete Member
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-row">
            <span>Page {filters.page} of {pageCount} - {data.total} members</span>
            <div>
              <button type="button" onClick={() => updateFilter("page", Math.max(1, filters.page - 1))} disabled={filters.page <= 1 || isLoading}>Previous</button>
              <button type="button" onClick={() => updateFilter("page", Math.min(pageCount, filters.page + 1))} disabled={filters.page >= pageCount || isLoading}>Next</button>
            </div>
          </div>
        </>
      ) : null}

      {detail ? (
        <MemberDetailPanel
          member={detail}
          canManage
          onClose={() => setDetail(null)}
          onRefresh={() => openDetail(detail.id)}
        />
      ) : null}
    </section>
  );
}

function MemberForm({
  member,
  clubs,
  viewerRole,
  isSubmitting,
  onSubmit,
  onCancel
}: {
  member: MemberDetail | null;
  clubs: MembersResponse["clubs"];
  viewerRole: Role;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const nameParts = splitDisplayName(member);
  const defaultClubIds = member?.clubs.map((club) => club.id).filter(Boolean) as string[] | undefined;
  const singleClub = clubs.length === 1 ? clubs[0] : null;
  const [selectedRole, setSelectedRole] = useState<Role>(member?.role ?? "STUDENT");
  const isFacilitatorEdit = Boolean(member) && viewerRole === "FACILITATOR";
  const showIdentityFields = !member || viewerRole === "ADMIN";
  const showStudentFields = !member || isFacilitatorEdit || selectedRole === "STUDENT";
  const showClubAssignment = !member || (viewerRole === "ADMIN" && selectedRole !== "ADMIN");

  return (
    <form id="member-form" className="admin-form wide member-editor-form" onSubmit={onSubmit}>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">{member ? "Edit member" : "Add member"}</p>
          <h3>{member ? member.displayName : "New Student Member"}</h3>
        </div>
      </div>
      <div className="form-two-column">
        {showIdentityFields ? (
          <>
            <label>First Name<input name="firstName" defaultValue={nameParts.firstName} placeholder="First name" required /></label>
            <label>Last Name<input name="lastName" defaultValue={nameParts.lastName} placeholder="Last name" required /></label>
            <label>Email<input name="email" type="email" defaultValue={member?.email ?? ""} placeholder="name@example.com" required /></label>
          </>
        ) : null}
        {!member ? <label>Password<input name="password" type="password" placeholder="Minimum 8 characters" required minLength={8} /></label> : null}
        {member && viewerRole === "ADMIN" ? (
          <label>
            Role
            <select name="role" value={selectedRole} onChange={(event) => setSelectedRole(event.currentTarget.value as Role)} required>
              <option value="STUDENT">Student</option>
              <option value="FACILITATOR">Facilitator</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
        ) : null}
        {showStudentFields ? (
          <>
            {!isFacilitatorEdit ? <label>Grade<input name="grade" defaultValue={member?.grade ?? ""} placeholder="Grade 6" /></label> : null}
            <label>
              Program Level
              <select name="programLevel" defaultValue={member?.programLevel ?? "SENIOR"}>
                {programLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Current Band Level
              <select name="bandLevel" defaultValue={member?.currentBandLevel ?? "White"}>
                {bandLevelOptions.map((bandLevel) => (
                  <option key={bandLevel} value={bandLevel}>{bandLevel}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {showClubAssignment ? (
          <label>
            {selectedRole === "FACILITATOR" ? "Assigned Clubs" : "Club"}
            {singleClub ? (
              <>
                <input type="hidden" name="clubIds" value={singleClub.id} />
                <select value={singleClub.id} disabled>
                  <option value={singleClub.id}>{singleClub.name}</option>
                </select>
              </>
            ) : (
              <select name="clubIds" multiple defaultValue={defaultClubIds ?? []} required>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            )}
          </label>
        ) : null}
      </div>
      {isFacilitatorEdit ? <p className="field-note">You can update program and band levels here. Use View Progress to manage band sign-off.</p> : null}
      <div className="edit-user-actions">
        <button type="submit" disabled={isSubmitting || ((!member || showClubAssignment) && !clubs.length)}>{member ? "Save Member" : "Add Member"}</button>
        <button type="button" className="text-action" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
      </div>
    </form>
  );
}

function MemberDetailPanel({
  member,
  canManage,
  onClose,
  onRefresh
}: {
  member: MemberDetail;
  canManage: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function backfillBands() {
    if (!window.confirm("This will mark all requirements before the student's current band as completed. Continue?")) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await backfillPreviousBandRequirements(member.id);
      await onRefresh();
      setStatus(`Backfilled ${result.updatedCount} requirements.`);
    } catch (backfillError) {
      setError(backfillError instanceof Error ? backfillError.message : "Unable to backfill requirements.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateRequirement(requirementId: string, currentCount: number, isCompleted: boolean) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await updateStudentRequirement(member.id, requirementId, {
        currentCount,
        isCompleted,
        notes: isCompleted ? "Marked complete from member detail" : "Completion undone from member detail"
      });
      await onRefresh();
      setStatus("Requirement updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update requirement.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="member-detail-panel" id="member-detail" aria-label="Member detail">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Member detail</p>
          <h3>{member.displayName}</h3>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <div className="progress-summary-grid">
        <SummaryTile label="Program Level" valueText={formatProgramLevel(member.programLevel)} />
        <SummaryTile label="Current Band" valueText={member.currentBandLevel} />
        <SummaryTile label="Status" valueText={member.isActive === false ? "Inactive" : "Active"} />
        <SummaryTile label="Clubs" valueText={member.clubs.map((club) => club.name).join(", ") || "No club"} />
        <SummaryTile label="Roles Completed" value={member.summary?.rolesCompleted ?? 0} />
        <SummaryTile label="Average Score" valueText={member.summary?.averageScore == null ? "N/A" : `${member.summary.averageScore}/100`} />
        <SummaryTile label="Last Feedback Date" valueText={member.summary?.lastFeedbackDate ? formatDate(member.summary.lastFeedbackDate) : "None"} />
        <SummaryTile label="Attendance" valueText={`${member.summary?.attendancePresent ?? 0}/${member.summary?.attendanceTotal ?? 0} present`} />
      </div>

      <div className="student-progress-grid">
        <DataPanel title="Profile Summary">
          <ul className="record-list">
            <li><strong>Name</strong><span>{member.displayName}</span></li>
            {member.email ? <li><strong>Email</strong><span>{member.email}</span></li> : null}
            <li><strong>Club</strong><span>{member.clubs.map((club) => `${club.name}${club.centreName ? ` - ${club.centreName}` : ""}`).join(", ")}</span></li>
            <li><strong>Program Level</strong><span>{formatProgramLevel(member.programLevel)}</span></li>
            <li><strong>Current Band</strong><span>{member.currentBandLevel}</span></li>
          </ul>
        </DataPanel>

        <div className="member-detail-anchor" id="member-progress">
          <DataPanel title="Personal Tracking Details">
            {member.trackingSummary ? (
              <>
                <ul className="record-list">
                  <li><strong>Current band</strong><span>{member.trackingSummary.currentBand}</span></li>
                  <li><strong>Completed requirements</strong><span>{member.trackingSummary.completedRequirements}</span></li>
                  <li><strong>Remaining requirements</strong><span>{member.trackingSummary.remainingRequirements}</span></li>
                </ul>
                {canManage ? <button type="button" className="text-action" onClick={backfillBands} disabled={isSubmitting}>Backfill Previous Bands</button> : null}
              </>
            ) : <p>Private progress details are not available.</p>}
          </DataPanel>
        </div>

        <div className="member-detail-anchor" id="member-feedback">
          <DataPanel title="Scores & Feedback">
            {member.feedback?.length ? (
              <ul className="record-list">
                {member.feedback.slice(0, 8).map((entry) => (
                  <li key={entry.id}>
                    <strong>{formatDate(entry.meetingDate)} - {entry.score}/100</strong>
                    <span>{entry.meetingTitle} - {entry.roleName} - {entry.feedback || "No feedback entered."} - {entry.facilitatorName}</span>
                  </li>
                ))}
              </ul>
            ) : <p>No facilitator feedback yet.</p>}
          </DataPanel>
        </div>
      </div>

      {member.requirements?.length ? (
        <DataPanel title="Band Requirements">
          <ul className="requirement-list">
            {member.requirements.map((entry) => (
              <li key={entry.requirement.id} className={entry.isCompleted ? "is-complete" : ""}>
                <div>
                  <strong>{entry.requirement.bandLevel}: {entry.requirement.requirementType} - {entry.requirement.name}</strong>
                  <span>{entry.requirement.description}</span>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => updateRequirement(entry.requirement.id, entry.isCompleted ? 0 : entry.requirement.targetCount, !entry.isCompleted)}
                    disabled={isSubmitting}
                  >
                    {entry.isCompleted ? "Undo Completion" : "Mark Complete"}
                  </button>
                ) : <em>{entry.currentCount}/{entry.requirement.targetCount}</em>}
              </li>
            ))}
          </ul>
        </DataPanel>
      ) : null}

      <div className="student-progress-grid">
        <DataPanel title="Attendance">
          {member.attendance?.length ? (
            <ul className="record-list">
              {member.attendance.slice(0, 12).map((entry) => (
                <li key={entry.id}>
                  <strong>{formatDate(entry.meetingDate)} - {entry.status}</strong>
                  <span>{entry.meetingTitle} - {entry.clubName}{entry.notes ? ` - ${entry.notes}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p>No attendance records yet.</p>}
        </DataPanel>
        <DataPanel title="Role History">
          {member.roleHistory?.length ? (
            <ul className="record-list">
              {member.roleHistory.slice(0, 12).map((entry) => (
                <li key={entry.id}>
                  <strong>{formatDate(entry.meetingDate)} - {entry.roleName}</strong>
                  <span>{entry.meetingTitle} - {entry.clubName} - attendance: {entry.attendanceStatus ?? "Not marked"}</span>
                </li>
              ))}
            </ul>
          ) : <p>No role history yet.</p>}
        </DataPanel>
      </div>
    </section>
  );
}

