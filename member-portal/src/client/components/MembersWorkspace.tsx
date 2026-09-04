import { FormEvent, useEffect, useRef, useState } from "react";
import {
  addMemberPoints,
  backfillPreviousBandRequirements,
  createMemberFeedback,
  createMember,
  deleteMemberFeedback,
  getMemberLearningReflections,
  getMemberDetail,
  getMemberPaymentStatuses,
  getMemberPointsProgress,
  getMembers,
  MemberDetail,
  LearningReflection,
  MemberListEntry,
  MemberPointsProgress,
  MembersResponse,
  PaymentStatus,
  permanentlyDeleteMember,
  PortalUser,
  Role,
  resetMemberPaymentStatuses,
  resetUserPassword,
  setMemberPaymentStatus,
  setUserActive,
  updateMember,
  updateMemberFeedback,
  updateMemberProgressNote,
  saveLearningReflectionResponse,
  updateUser,
  updateStudentRequirement
} from "../api";
import {
  bandLevelOptions,
  DataPanel,
  formatDate,
  formatProgramLevel,
  isOperationalManagerRole,
  programLevelOptions,
  splitDisplayName,
  SummaryTile
} from "./portalShared";

export const paymentResetConfirmationMessage = "Are you sure you want to reset all active members to Not Paid for this month?";

export function MembersWorkspace({ user }: { user: PortalUser }) {
  const loadRequestId = useRef(0);
  const [data, setData] = useState<MembersResponse | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [editingMember, setEditingMember] = useState<MemberDetail | null>(null);
  const [passwordResetMember, setPasswordResetMember] = useState<MemberDetail | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<MemberListEntry | null>(null);
  const [reactivationTarget, setReactivationTarget] = useState<MemberListEntry | null>(null);
  const [reactivationClubIds, setReactivationClubIds] = useState<string[]>([]);
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
  const [paymentMonth] = useState(currentPaymentMonth);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>({});

  async function loadMembers(nextFilters = filters) {
    const requestId = ++loadRequestId.current;
    setError("");
    setIsLoading(true);

    try {
      const [result, paymentResult] = await Promise.all([
        getMembers(nextFilters),
        isOperationalManagerRole(user.role) ? getMemberPaymentStatuses(paymentMonth) : Promise.resolve(null)
      ]);
      if (requestId === loadRequestId.current) {
        setData(result);
        if (paymentResult) {
          setPaymentStatuses(Object.fromEntries(paymentResult.payments.map((payment) => [payment.studentId, payment.status])));
        }
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

  async function updatePaymentStatus(member: MemberListEntry, nextStatus: PaymentStatus) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await setMemberPaymentStatus(member.id, paymentMonth, nextStatus);
      setPaymentStatuses((current) => ({ ...current, [member.id]: result.payment.status }));
      setStatus(`${member.displayName} marked ${paymentStatusLabel(result.payment.status)}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update payment status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resetPaymentStatuses() {
    const confirmed = window.confirm(paymentResetConfirmationMessage);

    if (!confirmed) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await resetMemberPaymentStatuses(paymentMonth);
      const refreshedPayments = await getMemberPaymentStatuses(paymentMonth);
      setPaymentStatuses(Object.fromEntries(refreshedPayments.payments.map((payment) => [payment.studentId, payment.status])));
      setStatus(`${result.resetCount} active member${result.resetCount === 1 ? "" : "s"} reset to Not Paid.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset payment statuses.");
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

  function startMemberReactivation(member: MemberListEntry) {
    setError("");
    setStatus("");
    setReactivationTarget(member);
    setReactivationClubIds([]);
    window.setTimeout(() => {
      document.getElementById("member-reactivation-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }

  async function handleMemberReactivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reactivationTarget?.userId) {
      setError("This member account cannot be reactivated from the Members page.");
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await setUserActive(reactivationTarget.userId, true, reactivationClubIds);
      await loadMembers();
      setDetail(null);
      setStatus(reactivationClubIds.length
        ? "Member reactivated with selected club access."
        : "Member reactivated without active club access.");
      setReactivationTarget(null);
      setReactivationClubIds([]);
    } catch (reactivationError) {
      setError(reactivationError instanceof Error ? reactivationError.message : "Unable to reactivate member.");
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
      setPasswordResetMember(null);
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

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passwordResetMember?.userId) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    setError("");
    setStatus("");

    if (newPassword !== confirmPassword) {
      setError("Temporary passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetUserPassword(passwordResetMember.userId, newPassword);
      form.reset();
      setPasswordResetMember(null);
      setStatus("Password reset successfully.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset password.");
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
        if (isOperationalManagerRole(user.role)) {
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
        setStatus("Member added.");
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

  async function submitMemberFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!feedbackTarget?.clubId) {
      setError("Select a member from a club before writing feedback.");
      return;
    }

    const form = event.currentTarget;
    const feedback = String(new FormData(form).get("feedback") || "").trim();
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await createMemberFeedback(feedbackTarget.id, { clubId: feedbackTarget.clubId, feedback });
      const studentId = feedbackTarget.id;
      setFeedbackTarget(null);
      setStatus("Member feedback saved.");
      await openDetail(studentId, "member-feedback");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save member feedback.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const clubs = data?.clubs.filter((club) => !filters.centreId || club.centreId === filters.centreId) ?? [];
  const assignableClubs = data?.clubs.filter((club) => club.isActive && club.centre?.isActive !== false) ?? [];
  const showMemberResults = user.role !== "FACILITATOR" || Boolean(filters.clubId);

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
          {isOperationalManagerRole(user.role) ? (
            <button type="button" className="danger-action" onClick={resetPaymentStatuses} disabled={isLoading || isSubmitting}>
              Reset All to Not Paid
            </button>
          ) : null}
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
          onResetPassword={isOperationalManagerRole(user.role) && editingMember ? () => {
            setPasswordResetMember(editingMember);
            setEditingMember(null);
            window.setTimeout(() => document.getElementById("member-password-reset-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
          } : undefined}
          onCancel={() => {
            setIsAddFormOpen(false);
            setEditingMember(null);
          }}
        />
      ) : null}

      {passwordResetMember ? (
        <form id="member-password-reset-form" className="admin-form wide" onSubmit={handlePasswordReset}>
          <div className="admin-heading">
            <div>
              <p className="eyebrow">Authorized password reset</p>
              <h3>Reset Password for {passwordResetMember.displayName}</h3>
            </div>
          </div>
          <p className="field-note warning-text">This will replace the user’s current password. Share the temporary password securely and ask the user to change it after login.</p>
          <div className="form-two-column">
            <label>New temporary password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
            <label>Confirm temporary password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
          </div>
          <div className="edit-user-actions">
            <button type="submit" disabled={isSubmitting}>Save</button>
            <button type="button" className="text-action" onClick={() => setPasswordResetMember(null)} disabled={isSubmitting}>Cancel</button>
          </div>
        </form>
      ) : null}

      {feedbackTarget ? (
        <form id="member-feedback-form" className="admin-form wide member-feedback-form" onSubmit={submitMemberFeedback}>
          <div className="admin-heading">
            <div>
              <p className="eyebrow">Write Feedback</p>
              <h3>{feedbackTarget.displayName}</h3>
              <span>{feedbackTarget.clubName}</span>
            </div>
          </div>
          <label>
            Feedback/comment
            <textarea name="feedback" rows={6} maxLength={5000} required autoFocus placeholder="Write feedback for this member..." />
          </label>
          <div className="edit-user-actions">
            <button type="submit" disabled={isSubmitting}>Save Feedback</button>
            <button type="button" className="text-action" onClick={() => setFeedbackTarget(null)} disabled={isSubmitting}>Cancel</button>
          </div>
        </form>
      ) : null}

      <div className="member-filter-form">
        {isOperationalManagerRole(user.role) ? (
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
            <option value="">{user.role === "FACILITATOR" ? "Select a club" : "All clubs"}</option>
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
      {!isLoading && !showMemberResults ? <p className="loading-state">Select an assigned club to view its members.</p> : null}
      {!isLoading && showMemberResults && !data?.members.length ? <p className="loading-state">No members found.</p> : null}

      {showMemberResults && data?.members.length ? (
        <>
          <div className="feedback-table-wrap">
            <table className={`feedback-table members-table${isOperationalManagerRole(user.role) ? " has-payment-status" : ""}`}>
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th>Email</th>
                  <th>Club</th>
                  <th>Program Level</th>
                  <th>Current Band</th>
                  {isOperationalManagerRole(user.role) ? <th>Payment Status</th> : null}
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
                    {isOperationalManagerRole(user.role) ? (
                      <td className="payment-status-cell">
                        <PaymentStatusButton
                          memberName={member.displayName}
                          status={paymentStatuses[member.id] ?? "NOT_PAID"}
                          disabled={isSubmitting}
                          onToggle={(nextStatus) => updatePaymentStatus(member, nextStatus)}
                        />
                      </td>
                    ) : null}
                    <td className="members-actions-cell">
                      <div className="member-row-actions">
                        <button type="button" onClick={() => openDetail(member.id)} disabled={isSubmitting}>View Details</button>
                        <button type="button" onClick={() => startEditingMember(member.id)} disabled={isSubmitting}>Edit Member</button>
                        <button type="button" onClick={() => openDetail(member.id, "member-band-progress")} disabled={isSubmitting}>Update Progress</button>
                        <button type="button" onClick={() => openDetail(member.id, "member-feedback")} disabled={isSubmitting}>View Feedback</button>
                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackTarget(member);
                            window.setTimeout(() => document.getElementById("member-feedback-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                          }}
                            disabled={isSubmitting || (user.role === "FACILITATOR" && member.isActive === false)}
                        >
                          Write Feedback
                        </button>
                        {isOperationalManagerRole(user.role) ? (
                          <button
                            type="button"
                            className="danger-action"
                            onClick={() => member.isActive === false
                              ? startMemberReactivation(member)
                              : updateMemberStatus(member, false)}
                            disabled={isSubmitting}
                          >
                            {member.isActive === false ? "Reactivate" : "Deactivate"}
                          </button>
                        ) : null}
                        {isOperationalManagerRole(user.role) ? (
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
          {reactivationTarget ? (
            <form id="member-reactivation-form" className="edit-user-panel" onSubmit={handleMemberReactivation}>
              <div className="admin-heading">
                <div>
                  <p className="eyebrow">Reactivate member</p>
                  <h3>{reactivationTarget.displayName}</h3>
                </div>
              </div>
              <label>
                Member Clubs
                <select
                  multiple
                  value={reactivationClubIds}
                  onChange={(event) => setReactivationClubIds(
                    Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                  )}
                >
                  {(data.clubs ?? [])
                    .filter((club) => club.isActive && club.centre?.isActive !== false)
                    .map((club) => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                </select>
              </label>
              {!reactivationClubIds.length ? (
                <p className="field-note warning-text">This account will reactivate, but the member/facilitator will not have active club access.</p>
              ) : null}
              <div className="edit-user-actions">
                <button type="submit" disabled={isSubmitting}>Reactivate Member</button>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    setReactivationTarget(null);
                    setReactivationClubIds([]);
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
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
          viewerRole={user.role}
          onClose={() => setDetail(null)}
          onRefresh={() => openDetail(detail.id)}
        />
      ) : null}
    </section>
  );
}

export function PaymentStatusButton({
  memberName,
  status,
  disabled,
  onToggle
}: {
  memberName: string;
  status: PaymentStatus;
  disabled: boolean;
  onToggle: (nextStatus: PaymentStatus) => void;
}) {
  const nextStatus = status === "PAID" ? "NOT_PAID" : "PAID";

  return (
    <button
      type="button"
      className={`payment-status-button ${status === "PAID" ? "is-paid" : "is-not-paid"}`}
      aria-label={`Mark ${memberName} as ${paymentStatusLabel(nextStatus)}`}
      onClick={() => onToggle(nextStatus)}
      disabled={disabled}
    >
      {paymentStatusLabel(status)}
    </button>
  );
}

function currentPaymentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function paymentStatusLabel(status: PaymentStatus) {
  return status === "PAID" ? "Paid" : "Not Paid";
}

function MemberForm({
  member,
  clubs,
  viewerRole,
  isSubmitting,
  onSubmit,
  onResetPassword,
  onCancel
}: {
  member: MemberDetail | null;
  clubs: MembersResponse["clubs"];
  viewerRole: Role;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResetPassword?: () => void;
  onCancel: () => void;
}) {
  const nameParts = splitDisplayName(member);
  const defaultClubIds = member?.clubs.map((club) => club.id).filter(Boolean) as string[] | undefined;
  const singleClub = clubs.length === 1 ? clubs[0] : null;
  const [selectedRole, setSelectedRole] = useState<Role>(member?.role ?? "STUDENT");
  const isFacilitatorEdit = Boolean(member) && viewerRole === "FACILITATOR";
  const showIdentityFields = !member || isOperationalManagerRole(viewerRole);
  const showStudentFields = !member || isFacilitatorEdit || selectedRole === "STUDENT";
  const showClubAssignment = !member || (isOperationalManagerRole(viewerRole) && selectedRole !== "ADMIN" && selectedRole !== "CENTER_DIRECTOR");

  return (
    <form id="member-form" className="admin-form wide member-editor-form" onSubmit={onSubmit}>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">{member ? "Edit member" : "Add member"}</p>
          <h3>{member ? member.displayName : "New Member"}</h3>
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
              <option value="STUDENT">Member</option>
              <option value="FACILITATOR">Facilitator</option>
              <option value="CENTER_DIRECTOR">Center Director</option>
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
      {isFacilitatorEdit ? <p className="field-note">You can update program and band levels here. Use Update Progress to manage band sign-off.</p> : null}
      <div className="edit-user-actions">
        <button type="submit" disabled={isSubmitting || ((!member || showClubAssignment) && !clubs.length)}>{member ? "Save Member" : "Add Member"}</button>
        {member && onResetPassword ? <button type="button" className="text-action" onClick={onResetPassword} disabled={isSubmitting}>Reset Password</button> : null}
        <button type="button" className="text-action" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
      </div>
    </form>
  );
}

function MemberDetailPanel({
  member,
  canManage,
  viewerRole,
  onClose,
  onRefresh
}: {
  member: MemberDetail;
  canManage: boolean;
  viewerRole: Role;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null);
  const [editingFeedbackText, setEditingFeedbackText] = useState("");
  const [reflections, setReflections] = useState<LearningReflection[]>([]);
  const [reflectionResponses, setReflectionResponses] = useState<Record<string, string>>({});

  useEffect(() => {
    getMemberLearningReflections(member.id)
      .then((result) => {
        setReflections(result.reflections);
        setReflectionResponses(Object.fromEntries(result.reflections.map((entry) => [entry.id, entry.facilitatorResponse ?? ""])));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load learning reflections."));
  }, [member.id]);

  async function backfillBands() {
    if (!window.confirm("This will mark all requirements before the member's current band as completed. Continue?")) {
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

  async function saveFeedbackEdit(feedbackId: string) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await updateMemberFeedback(member.id, feedbackId, { feedback: editingFeedbackText.trim() });
      setEditingFeedbackId(null);
      setEditingFeedbackText("");
      await onRefresh();
      setStatus("Member feedback updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update member feedback.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeFeedback(feedbackId: string) {
    if (!window.confirm("Delete this member feedback? This action cannot be undone.")) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await deleteMemberFeedback(member.id, feedbackId);
      await onRefresh();
      setStatus("Member feedback deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete member feedback.");
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

  async function saveReflectionResponse(reflectionId: string) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const responseText = reflectionResponses[reflectionId]?.trim() || null;
      const result = await saveLearningReflectionResponse(reflectionId, responseText);
      setReflections((current) => current.map((entry) => entry.id === reflectionId ? result.reflection : entry));
      setReflectionResponses((current) => ({ ...current, [reflectionId]: result.reflection.facilitatorResponse ?? "" }));
      setStatus(responseText ? "Staff response saved." : "Staff response removed.");
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : "Unable to save the staff response.");
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
          <DataPanel title="Member Feedback">
            {member.memberFeedback?.length ? (
              <ul className="record-list member-feedback-list">
                {member.memberFeedback.map((entry) => (
                  <li key={entry.id}>
                    <strong>{formatDate(entry.createdAt)} - {entry.facilitatorName}</strong>
                    {editingFeedbackId === entry.id ? (
                      <>
                        <textarea rows={5} maxLength={5000} value={editingFeedbackText} onChange={(event) => setEditingFeedbackText(event.currentTarget.value)} />
                        <div className="member-row-actions">
                          <button type="button" onClick={() => saveFeedbackEdit(entry.id)} disabled={isSubmitting || !editingFeedbackText.trim()}>Save</button>
                          <button type="button" className="text-action" onClick={() => setEditingFeedbackId(null)} disabled={isSubmitting}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>{entry.feedback}</span>
                        <small>{entry.clubName}{entry.updatedAt !== entry.createdAt ? ` - updated ${formatDate(entry.updatedAt)}` : ""}</small>
                        {entry.canEdit && (isOperationalManagerRole(viewerRole) || viewerRole === "FACILITATOR") ? (
                          <div className="member-row-actions">
                            <button type="button" className="text-action" onClick={() => { setEditingFeedbackId(entry.id); setEditingFeedbackText(entry.feedback); }} disabled={isSubmitting}>Edit</button>
                            <button type="button" className="danger-action" onClick={() => removeFeedback(entry.id)} disabled={isSubmitting}>Delete</button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p>No member feedback yet.</p>}
          </DataPanel>
          <DataPanel title="Meeting Scores & Feedback">
            {member.feedback?.length ? (
              <ul className="record-list">
                {member.feedback.slice(0, 8).map((entry) => (
                  <li key={entry.id}>
                    <strong>{formatDate(entry.meetingDate)} - {entry.score}/100</strong>
                    <span>{entry.meetingTitle} - {entry.roleName} - {entry.feedback || "No feedback entered."} - {entry.facilitatorName}</span>
                  </li>
                ))}
              </ul>
            ) : <p>No meeting feedback yet.</p>}
          </DataPanel>
          <DataPanel title="Learning Reflections">
            {reflections.length ? (
              <div className="learning-reflection-list is-staff-view">
                {reflections.map((reflection) => {
                  const responseText = reflectionResponses[reflection.id] ?? "";

                  return (
                    <article key={reflection.id}>
                      <div className="reflection-heading">
                        <strong>Reflection Date: {formatDate(reflection.reflectionDate)}</strong>
                      </div>
                      <dl>
                        <div><dt>What I learned</dt><dd>{reflection.whatLearned}</dd></div>
                        <div><dt>What I did well</dt><dd>{reflection.whatDidWell}</dd></div>
                        <div><dt>What I want to improve</dt><dd>{reflection.whatToImprove}</dd></div>
                      </dl>
                      {reflection.thinksBandRequirementCompleted ? <p className="reflection-self-check">Member self-check: thinks they completed {reflection.bandRequirement ? `${reflection.bandRequirement.bandLevel} - ${reflection.bandRequirement.name}` : "a band requirement"}. This is not staff sign-off.</p> : null}
                      <label>
                        <span className="reflection-label"><span>Short staff response (optional)</span><small>{responseText.length}/300</small></span>
                        <textarea rows={3} maxLength={300} value={responseText} onChange={(event) => setReflectionResponses((current) => ({ ...current, [reflection.id]: event.currentTarget.value }))} />
                      </label>
                      <button type="button" onClick={() => saveReflectionResponse(reflection.id)} disabled={isSubmitting}>Save Response</button>
                    </article>
                  );
                })}
              </div>
            ) : <p>No learning reflections yet.</p>}
          </DataPanel>
        </div>
      </div>

      <MemberPointsProgressPanel studentId={member.id} />

      <div className="member-detail-anchor">
        <DataPanel title="Band Requirements">
          {member.requirements?.length ? (
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
          ) : <p>No band requirements are available for this member.</p>}
        </DataPanel>
      </div>

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

export function MemberPointsProgressPanel({ studentId }: { studentId: string }) {
  const [progress, setProgress] = useState<MemberPointsProgress | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    getMemberPointsProgress(studentId)
      .then((result) => {
        if (!isCurrent) return;
        setProgress(result);
        setNote(result.progressNote?.note ?? "");
      })
      .catch((loadError) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Unable to load member points.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [studentId]);

  async function handleAddPoints(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus("");
    setError("");
    setIsSubmitting(true);

    try {
      const result = await addMemberPoints(studentId, {
        points: Number(formData.get("points")),
        reason: String(formData.get("reason") || "")
      });
      setProgress(result);
      form.reset();
      setStatus("Points added successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add points.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");
    setIsSubmitting(true);

    try {
      const result = await updateMemberProgressNote(studentId, note);
      setProgress(result);
      setNote(result.progressNote?.note ?? "");
      setStatus("Progress notes saved successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save progress notes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="member-points-panel" id="member-band-progress" aria-label="Member points and progress notes">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Personal Tracking</p>
          <h3>Points and Progress Notes</h3>
        </div>
        <strong className="points-total">Total Points: {progress?.totalPoints ?? 0}</strong>
      </div>
      {isLoading ? <p className="loading-state">Loading points and progress notes...</p> : null}
      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {!isLoading && progress ? (
        <>
          <div className="member-points-forms">
            <form className="meeting-form compact" onSubmit={handleAddPoints}>
              <h4>Add Points</h4>
              <label>Add Points<input name="points" type="number" min="1" step="1" required /></label>
              <label>Reason<input name="reason" maxLength={500} placeholder="Optional reason" /></label>
              <p className="field-note">This motivational total is separate from formal scores and band completion. Positive point awards only for now; deductions can be added later.</p>
              <button type="submit" disabled={isSubmitting}>Add Points</button>
            </form>
            <form className="meeting-form compact" onSubmit={handleSaveNote}>
              <h4>Progress Notes from Staff</h4>
              <label>
                Progress Notes from Staff
                <textarea value={note} maxLength={1000} rows={6} onChange={(event) => setNote(event.currentTarget.value)} />
              </label>
              <small className="character-count">{note.length}/1000</small>
              <button type="submit" disabled={isSubmitting}>Save Progress Notes</button>
            </form>
          </div>
          <DataPanel title="Recent Point History">
            <PointHistoryList progress={progress} />
          </DataPanel>
        </>
      ) : null}
    </section>
  );
}

export function PointHistoryList({ progress }: { progress: MemberPointsProgress }) {
  if (!progress.transactions.length) {
    return <p>No points have been awarded yet.</p>;
  }

  return (
    <ul className="record-list">
      {progress.transactions.map((transaction) => (
        <li key={transaction.id}>
          <strong>{formatDate(transaction.awardedAt)} - +{transaction.pointsDelta} points</strong>
          <span>{transaction.reason || "No reason entered."}{transaction.awardedBy ? ` - ${transaction.awardedBy.firstName} ${transaction.awardedBy.lastName}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
