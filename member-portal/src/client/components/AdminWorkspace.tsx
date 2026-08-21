import { FormEvent, useEffect, useState } from "react";
import {
  AdminOverview,
  assignClubFacilitator,
  createCentre,
  createClub,
  createUser,
  deleteDemoUser,
  deleteSampleFeedback,
  deleteSampleUsers,
  getAdminOverview,
  PortalUser,
  removeClubFacilitator,
  resetDemoMeetingData,
  resetUserPassword,
  Role,
  setCentreActive,
  setClubActive,
  setUserActive,
  updateUser
} from "../api";
import {
  bandLevelOptions,
  DataPanel,
  formatCleanupSummary,
  formatProgramLevel,
  formatRole,
  formatStudentClubs,
  isDemoUser,
  programLevelOptions,
  StatusBadge,
  SummaryTile
} from "./portalShared";
type AdminUser = AdminOverview["users"][number];

export function AdminWorkspace({ currentUser }: { currentUser: PortalUser }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUserRole, setNewUserRole] = useState<Role>("STUDENT");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editingUserRole, setEditingUserRole] = useState<Role>("STUDENT");
  const [passwordResetUser, setPasswordResetUser] = useState<AdminUser | null>(null);

  async function refreshOverview() {
    const data = await getAdminOverview();
    setOverview(data);
  }

  function refreshOverviewSafely() {
    setError("");
    setIsLoading(true);
    refreshOverview()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load admin data."))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    refreshOverview()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load admin data."))
      .finally(() => setIsLoading(false));
  }, []);

  async function submitAdminForm(
    event: FormEvent<HTMLFormElement>,
    action: (form: HTMLFormElement) => Promise<void>,
    successMessage: string
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await action(form);
      form?.reset();
      setNewUserRole("STUDENT");
      await refreshOverview();
      setStatus(successMessage);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save changes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const clubs = overview?.clubs ?? [];
  const activeCentres = overview?.centres.filter((centre) => centre.isActive) ?? [];
  const activeClubs = clubs.filter((club) => club.isActive && club.centre?.isActive !== false);
  const activeFacilitators = overview?.users.filter((portalUser) => portalUser.role === "FACILITATOR" && portalUser.isActive) ?? [];

  function facilitatorClubIdsForUser(userId: string) {
    return clubs
      .filter((club) => club.facilitators?.some((assignment) => assignment.facilitator.id === userId))
      .map((club) => club.id);
  }

  function startEditingUser(portalUser: AdminUser) {
    setError("");
    setStatus("");
    setPasswordResetUser(null);
    setEditingUser(portalUser);
    setEditingUserRole(portalUser.role);
    window.setTimeout(() => {
      document.getElementById(`edit-user-${portalUser.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }

  function startResettingPassword(portalUser: AdminUser) {
    setError("");
    setStatus("");
    setEditingUser(null);
    setPasswordResetUser(portalUser);
    window.setTimeout(() => {
      document.getElementById(`reset-password-${portalUser.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }

  async function updateCentreStatus(centreId: string, isActive: boolean) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await setCentreActive(centreId, isActive);
      await refreshOverview();
      setStatus(isActive ? "Centre restored." : "Centre archived.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update centre.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateClubStatus(clubId: string, isActive: boolean) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await setClubActive(clubId, isActive);
      await refreshOverview();
      setStatus(isActive ? "Club restored." : "Club archived.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update club.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateUserStatus(userId: string, isActive: boolean) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await setUserActive(userId, isActive);
      await refreshOverview();
      setStatus(isActive ? "User reactivated." : "User deactivated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteDemoUser(portalUser: AdminUser) {
    if (!window.confirm("This permanently removes sample/test data only. Real member data will not be deleted. Continue?")) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await deleteDemoUser(portalUser.id);
      await refreshOverview();
      setStatus(formatCleanupSummary("Sample user deleted.", result));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete sample user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runDemoCleanup(action: () => Promise<unknown>, successMessage: string) {
    if (!window.confirm("This permanently removes sample/test data only. Real member data will not be deleted. Continue?")) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await action();
      await refreshOverview();
      setStatus(formatCleanupSummary(successMessage, result));
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Unable to clean up demo data.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFacilitatorAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await assignClubFacilitator(
        String(formData.get("clubId") || ""),
        String(formData.get("facilitatorId") || "")
      );
      form.reset();
      await refreshOverview();
      setStatus("Facilitator assigned to club.");
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : "Unable to assign facilitator.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveFacilitatorAssignment(clubId: string, facilitatorId: string) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await removeClubFacilitator(clubId, facilitatorId);
      await refreshOverview();
      setStatus("Facilitator access removed.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove facilitator access.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingUser) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const clubSelect = form.elements.namedItem("clubIds") as HTMLSelectElement | null;
    const facilitatorClubSelect = form.elements.namedItem("facilitatorClubIds") as HTMLSelectElement | null;
    const role = String(formData.get("role") || editingUser.role) as Role;

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await updateUser(editingUser.id, {
        firstName: String(formData.get("firstName") || ""),
        lastName: String(formData.get("lastName") || ""),
        email: String(formData.get("email") || ""),
        role,
        isActive: editingUser.isActive,
        grade: String(formData.get("grade") || ""),
        programLevel: String(formData.get("programLevel") || "SENIOR"),
        bandLevel: String(formData.get("bandLevel") || "White"),
        clubIds: role === "STUDENT" && clubSelect ? Array.from(clubSelect.selectedOptions).map((option) => option.value) : [],
        facilitatorClubIds: role === "FACILITATOR" && facilitatorClubSelect ? Array.from(facilitatorClubSelect.selectedOptions).map((option) => option.value) : []
      });
      await refreshOverview();
      setEditingUser(null);
      setStatus("User updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passwordResetUser) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    setError("");
    setStatus("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetUserPassword(passwordResetUser.id, newPassword);
      form.reset();
      setPasswordResetUser(null);
      setStatus(`Password reset for ${passwordResetUser.firstName} ${passwordResetUser.lastName}.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderEditUserForm(portalUser: AdminUser) {
    const isCurrentAdmin = portalUser.id === currentUser.id;

    return (
      <form id={`edit-user-${portalUser.id}`} key={portalUser.id} className="edit-user-panel" onSubmit={handleEditUserSubmit}>
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Edit user</p>
            <h3>{portalUser.firstName} {portalUser.lastName}</h3>
          </div>
        </div>
        <div className="form-two-column">
          <label>First Name<input name="firstName" defaultValue={portalUser.firstName} required /></label>
          <label>Last Name<input name="lastName" defaultValue={portalUser.lastName} required /></label>
          <label>Email<input name="email" type="email" defaultValue={portalUser.email} required /></label>
          <label>
            Role
            <select
              name="role"
              value={editingUserRole}
              onChange={(event) => setEditingUserRole(event.target.value as Role)}
              disabled={isCurrentAdmin}
              required
            >
              <option value="STUDENT">Member</option>
              <option value="FACILITATOR">Facilitator</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          {isCurrentAdmin ? (
            <>
              <input type="hidden" name="role" value="ADMIN" />
            </>
          ) : null}
          {editingUserRole === "STUDENT" ? (
            <>
              <label>Grade<input name="grade" defaultValue={portalUser.studentProfile?.grade ?? ""} placeholder="Grade 6" /></label>
              <label>
                Program Level
                <select name="programLevel" defaultValue={portalUser.studentProfile?.programLevel ?? "SENIOR"}>
                  {programLevelOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Current Band Level
                <select name="bandLevel" defaultValue={portalUser.studentProfile?.bandLevel ?? "White"}>
                  {bandLevelOptions.map((bandLevel) => (
                    <option key={bandLevel} value={bandLevel}>{bandLevel}</option>
                  ))}
                </select>
              </label>
              <label>
                Clubs
                <select
                  name="clubIds"
                  multiple
                  defaultValue={portalUser.studentProfile?.clubMemberships?.map((membership) => membership.clubId) ?? []}
                >
                  {activeClubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {editingUserRole === "FACILITATOR" ? (
            <label>
              Facilitator Clubs
              <select name="facilitatorClubIds" multiple defaultValue={facilitatorClubIdsForUser(portalUser.id)}>
                {activeClubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="edit-user-actions">
          <button type="submit" disabled={isSubmitting}>Save</button>
          <button type="button" className="text-action" onClick={() => setEditingUser(null)} disabled={isSubmitting}>Cancel</button>
        </div>
      </form>
    );
  }

  function renderResetPasswordForm(portalUser: AdminUser) {
    return (
      <form id={`reset-password-${portalUser.id}`} key={portalUser.id} className="edit-user-panel" onSubmit={handleResetPasswordSubmit}>
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Admin reset</p>
            <h3>Reset Password for {portalUser.firstName} {portalUser.lastName}</h3>
          </div>
        </div>
        <div className="form-two-column">
          <label>New Password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm New Password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
        </div>
        <div className="edit-user-actions">
          <button type="submit" disabled={isSubmitting}>Reset Password</button>
          <button type="button" className="text-action" onClick={() => setPasswordResetUser(null)} disabled={isSubmitting}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <section className="admin-workspace" id="admin" aria-label="Admin setup workspace">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Admin setup</p>
          <h2>Centres, clubs, users, and assignments</h2>
        </div>
        <button type="button" onClick={refreshOverviewSafely} disabled={isLoading}>Refresh</button>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <div className="admin-summary-grid">
        <SummaryTile label="Centres" value={overview?.centres.length ?? 0} />
        <SummaryTile label="Clubs" value={overview?.clubs.length ?? 0} />
        <SummaryTile label="Users" value={overview?.users.length ?? 0} />
        <SummaryTile label="Members" value={overview?.students.length ?? 0} />
      </div>

      <div className="admin-form-grid">
        <form
          className="admin-form"
          onSubmit={(event) =>
            submitAdminForm(
              event,
              async (form) => {
                const formData = new FormData(form);
                await createCentre({
                  name: String(formData.get("name") || ""),
                  province: String(formData.get("province") || ""),
                  city: String(formData.get("city") || ""),
                  address: String(formData.get("address") || "")
                });
              },
              "Centre created."
            )
          }
        >
          <h3>Add Centre</h3>
          <label>Name<input name="name" placeholder="Ottawa Centre" required /></label>
          <label>Province<input name="province" placeholder="Ontario" required /></label>
          <label>City<input name="city" placeholder="Ottawa" required /></label>
          <label>Address<input name="address" placeholder="Optional address" /></label>
          <button type="submit" disabled={isSubmitting}>Save Centre</button>
        </form>

        <form
          className="admin-form"
          onSubmit={(event) =>
            submitAdminForm(
              event,
              async (form) => {
                const formData = new FormData(form);
                await createClub({
                  centreId: String(formData.get("centreId") || ""),
                  name: String(formData.get("name") || ""),
                  program: String(formData.get("program") || "")
                });
              },
              "Club created."
            )
          }
        >
          <h3>Add Club</h3>
          <label>
            Centre
            <select name="centreId" required>
              <option value="">Select centre</option>
              {activeCentres.map((centre) => (
                <option key={centre.id} value={centre.id}>{centre.name} - {centre.city}</option>
              ))}
            </select>
          </label>
          <label>Name<input name="name" placeholder="Saturday Senior Club" required /></label>
          <label>Program<input name="program" placeholder="Senior Regular Meeting" required /></label>
          <button type="submit" disabled={isSubmitting || !overview?.centres.length}>Save Club</button>
        </form>

        <form
          className="admin-form wide"
          onSubmit={(event) =>
            submitAdminForm(
              event,
              async (form) => {
                const formData = new FormData(form);
                const clubSelect = form.elements.namedItem("clubIds") as HTMLSelectElement | null;
                const facilitatorClubSelect = form.elements.namedItem("facilitatorClubIds") as HTMLSelectElement | null;
                await createUser({
                  firstName: String(formData.get("firstName") || ""),
                  lastName: String(formData.get("lastName") || ""),
                  email: String(formData.get("email") || ""),
                  password: String(formData.get("password") || ""),
                  role: String(formData.get("role") || "STUDENT") as Role,
                  grade: String(formData.get("grade") || ""),
                  programLevel: String(formData.get("programLevel") || "SENIOR"),
                  bandLevel: String(formData.get("bandLevel") || "White"),
                  clubIds: clubSelect ? Array.from(clubSelect.selectedOptions).map((option) => option.value) : [],
                  facilitatorClubIds: facilitatorClubSelect ? Array.from(facilitatorClubSelect.selectedOptions).map((option) => option.value) : []
                });
              },
              "User created and assigned."
            )
          }
        >
          <h3>Add User</h3>
          <div className="form-two-column">
            <label>First Name<input name="firstName" placeholder="First name" required /></label>
            <label>Last Name<input name="lastName" placeholder="Last name" required /></label>
            <label>Email<input name="email" type="email" placeholder="name@example.com" required /></label>
            <label>Password<input name="password" type="password" placeholder="Minimum 8 characters" required minLength={8} /></label>
            <label>
              Role
              <select name="role" value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as Role)} required>
                <option value="STUDENT">Member</option>
                <option value="FACILITATOR">Facilitator</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            {newUserRole === "STUDENT" ? (
              <>
                <label>Grade<input name="grade" placeholder="Grade 6" /></label>
                <label>
                  Program Level
                  <select name="programLevel" defaultValue="SENIOR">
                    {programLevelOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Current Band Level
                  <select name="bandLevel" defaultValue="White">
                    {bandLevelOptions.map((bandLevel) => (
                      <option key={bandLevel} value={bandLevel}>{bandLevel}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Clubs
                  <select name="clubIds" multiple>
                    {activeClubs.map((club) => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {newUserRole === "FACILITATOR" ? (
              <label>
                Facilitator Clubs
                <select name="facilitatorClubIds" multiple>
                  {activeClubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <button type="submit" disabled={isSubmitting}>Save User</button>
        </form>
      </div>

      <section className="assignment-panel" aria-label="Facilitator club assignments">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Facilitator access</p>
            <h3>Assign Facilitators to Clubs</h3>
          </div>
        </div>
        <form className="assignment-form" onSubmit={handleFacilitatorAssignment}>
          <label>
            Facilitator
            <select name="facilitatorId" required>
              <option value="">Select facilitator</option>
              {activeFacilitators.map((facilitator) => (
                <option key={facilitator.id} value={facilitator.id}>{facilitator.firstName} {facilitator.lastName}</option>
              ))}
            </select>
          </label>
          <label>
            Active Club
            <select name="clubId" required>
              <option value="">Select club</option>
              {activeClubs.map((club) => (
                <option key={club.id} value={club.id}>{club.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={isSubmitting || !activeFacilitators.length || !activeClubs.length}>Assign Access</button>
        </form>
        {clubs.some((club) => club.facilitators?.length) ? (
          <ul className="assignment-list">
            {clubs.flatMap((club) => (club.facilitators ?? []).map((assignment) => (
              <li key={assignment.id}>
                <div>
                  <strong>{assignment.facilitator.firstName} {assignment.facilitator.lastName}</strong>
                  <span>{club.name}</span>
                </div>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => handleRemoveFacilitatorAssignment(club.id, assignment.facilitator.id)}
                  disabled={isSubmitting}
                >
                  Remove Access
                </button>
              </li>
            )))}
          </ul>
        ) : <p className="loading-state">No facilitator club assignments yet.</p>}
      </section>

      <section className="assignment-panel" aria-label="Demo and test data cleanup">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Demo/Test Data Cleanup</p>
            <h3>Remove Sample Data</h3>
          </div>
        </div>
        <p className="field-note">These actions only target sample/test records such as users with example.com email addresses or Sample in the name. Use the Members page for permanent deletion of real member records.</p>
        <div className="record-actions">
          <button
            type="button"
            className="text-action danger-action"
            onClick={() => runDemoCleanup(deleteSampleUsers, "Sample users deleted.")}
            disabled={isSubmitting}
          >
            Delete Sample Users
          </button>
          <button
            type="button"
            className="text-action danger-action"
            onClick={() => runDemoCleanup(deleteSampleFeedback, "Sample feedback deleted.")}
            disabled={isSubmitting}
          >
            Delete Sample Feedback
          </button>
          <button
            type="button"
            className="text-action danger-action"
            onClick={() => runDemoCleanup(resetDemoMeetingData, "Demo meeting data reset.")}
            disabled={isSubmitting}
          >
            Reset Demo Meeting Data
          </button>
        </div>
      </section>

      <div className="admin-table-grid">
        <DataPanel title="Centres">
          {isLoading ? <p>Loading...</p> : overview?.centres.length ? (
            <ul className="record-list">
              {overview.centres.map((centre) => (
                <li key={centre.id}>
                  <div>
                    <strong>{centre.name}</strong>
                    <StatusBadge isActive={centre.isActive} />
                  </div>
                  <span>{centre.city}, {centre.province} - {centre.clubs?.length ?? 0} clubs</span>
                  <button type="button" className="text-action" onClick={() => updateCentreStatus(centre.id, !centre.isActive)} disabled={isSubmitting}>
                    {centre.isActive ? "Archive Centre" : "Restore Centre"}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p>No centres yet.</p>}
        </DataPanel>

        <DataPanel title="Clubs">
          {overview?.clubs.length ? (
            <ul className="record-list">
              {overview.clubs.map((club) => (
                <li key={club.id}>
                  <div>
                    <strong>{club.name}</strong>
                    <StatusBadge isActive={club.isActive} />
                  </div>
                  <span>{club.program} - {club.studentMemberships?.length ?? 0} members - {club.facilitators?.length ?? 0} facilitators</span>
                  <button type="button" className="text-action" onClick={() => updateClubStatus(club.id, !club.isActive)} disabled={isSubmitting}>
                    {club.isActive ? "Archive Club" : "Restore Club"}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p>No clubs yet.</p>}
        </DataPanel>

        <DataPanel title="Users">
          {overview?.users.length ? (
            <>
              <ul className="record-list">
                {overview.users.map((portalUser) => (
                  <li key={portalUser.id} className={editingUser?.id === portalUser.id ? "is-editing-user" : undefined}>
                    <div>
                      <strong>{portalUser.firstName} {portalUser.lastName}</strong>
                      <StatusBadge isActive={portalUser.isActive} />
                    </div>
                    <span>
                      {formatRole(portalUser.role)} - {portalUser.email}
                      {portalUser.role === "STUDENT" && portalUser.studentProfile ? ` - ${formatProgramLevel(portalUser.studentProfile.programLevel)} - ${portalUser.studentProfile.bandLevel}` : ""}
                    </span>
                    <div className="record-actions">
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => startEditingUser(portalUser)}
                        disabled={isSubmitting}
                      >
                        Edit User
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => updateUserStatus(portalUser.id, !portalUser.isActive)}
                        disabled={isSubmitting || portalUser.id === currentUser.id}
                      >
                        {portalUser.isActive ? "Deactivate User" : "Reactivate User"}
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => startResettingPassword(portalUser)}
                        disabled={isSubmitting}
                      >
                        Reset Password
                      </button>
                      {isDemoUser(portalUser, currentUser.id) ? (
                        <button
                          type="button"
                          className="text-action danger-action"
                          onClick={() => handleDeleteDemoUser(portalUser)}
                          disabled={isSubmitting}
                        >
                          Delete User
                        </button>
                      ) : null}
                    </div>
                    {editingUser?.id === portalUser.id ? renderEditUserForm(portalUser) : null}
                    {passwordResetUser?.id === portalUser.id ? renderResetPasswordForm(portalUser) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : <p>No users yet.</p>}
        </DataPanel>

        <DataPanel title="Member Assignments">
          {overview?.students.length ? (
            <ul className="record-list">
              {overview.students.map((student) => (
                <li key={student.id}>
                  <strong>{student.user.firstName} {student.user.lastName}</strong>
                  <span>{student.grade} - {formatProgramLevel(student.programLevel)} - {student.bandLevel} - {formatStudentClubs(student)}</span>
                </li>
              ))}
            </ul>
          ) : <p>No member assignments yet.</p>}
        </DataPanel>
      </div>
    </section>
  );
}

