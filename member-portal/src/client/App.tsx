import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AdminOverview,
  addMeetingRoleSlot,
  assignClubFacilitator,
  assignMeetingSlot,
  backfillPreviousBandRequirements,
  claimMeetingSlot,
  clearToken,
  createBulkMeetings,
  createCentre,
  createClub,
  createMeeting,
  createUser,
  downloadAgenda,
  editMeetingRoleSlot,
  fetchStudentProgressForManager,
  FeedbackReportEntry,
  getAdminOverview,
  getCurrentUser,
  getFeedbackReport,
  getMeetingsOverview,
  getStoredToken,
  getStudentProgress,
  login,
  Meeting,
  MeetingsOverview,
  PortalUser,
  Role,
  scoreMeetingSlot,
  removeMeetingRoleSlot,
  removeClubFacilitator,
  setCentreActive,
  setClubActive,
  setUserActive,
  storeToken,
  StudentProgress,
  toggleMeetingLock,
  updateMeetingDetails,
  updateStudentProfile,
  updateStudentRequirement,
  updateUser
} from "./api";

const roleCopy: Record<Role, { title: string; summary: string; actions: string[]; reports: string[] }> = {
  ADMIN: {
    title: "Operations Control",
    summary: "Manage centres, clubs, members, facilitators, and portal configuration.",
    actions: ["Create centres and clubs", "Create facilitators and students", "Review enrollment and activity"],
    reports: ["Centre growth", "Club roster health", "Attendance and band progress"]
  },
  FACILITATOR: {
    title: "Club Meeting Workspace",
    summary: "Prepare meetings, manage role claims, override assignments, and track performance.",
    actions: ["Create upcoming meetings", "Lock or reopen roles", "Record attendance and scores"],
    reports: ["Meeting readiness", "Role participation", "Student progress"]
  },
  STUDENT: {
    title: "Student Dashboard",
    summary: "Claim open roles, prepare for upcoming meetings, and follow personal progress.",
    actions: ["Claim up to two open roles per meeting", "Download meeting agenda", "Review scores and feedback"],
    reports: ["Upcoming roles", "Band level status", "Role performance"]
  }
};

const upcomingWork = [
  "Centres and clubs management",
  "Meeting builder with agenda templates",
  "Student role self-claiming",
  "RTF agenda download",
  "Attendance, scoring, and Personal Tracking requirements"
];

const programLevelOptions = [
  { value: "JUNIOR", label: "Junior" },
  { value: "SENIOR", label: "Senior" }
];

const bandLevelOptions = [
  "White",
  "Yellow",
  "Orange I",
  "Orange II",
  "Green I",
  "Green II",
  "Blue I",
  "Blue II",
  "Red I",
  "Red II",
  "Brown I",
  "Brown II",
  "Black I",
  "Black II"
];

const roleNavItems: Record<Role, Array<{ href: string; label: string }>> = {
  ADMIN: [
    { href: "#overview", label: "Overview" },
    { href: "#admin", label: "Setup" },
    { href: "#meetings", label: "Meetings" },
    { href: "#feedback", label: "Feedback" },
    { href: "#requirements", label: "Band Progress" }
  ],
  FACILITATOR: [
    { href: "#overview", label: "Overview" },
    { href: "#meetings", label: "Meetings" },
    { href: "#feedback", label: "Feedback" },
    { href: "#requirements", label: "Band Progress" }
  ],
  STUDENT: [
    { href: "#overview", label: "Overview" },
    { href: "#meetings", label: "Meetings" },
    { href: "#feedback", label: "Feedback" },
    { href: "#progress", label: "My Progress" }
  ]
};

export function App() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(getStoredToken()));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getStoredToken()) {
      return;
    }

    getCurrentUser()
      .then((result) => setUser(result.user))
      .catch(() => clearToken())
      .finally(() => setIsLoading(false));
  }, []);

  async function handleLogin(email: string, password: string) {
    setError("");
    const result = await login(email, password);
    storeToken(result.token);
    setUser(result.user);
  }

  function handleLogout() {
    clearToken();
    setUser(null);
  }

  if (isLoading) {
    return <main className="portal-shell"><p className="loading-state">Loading portal...</p></main>;
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} error={error} setError={setError} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

function LoginScreen({
  onLogin,
  error,
  setError
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  error: string;
  setError: (message: string) => void;
}) {
  const [email, setEmail] = useState(import.meta.env.DEV ? "admin@ileapclub.com" : "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <div className="login-mark">iL</div>
          <span>member.ileapclub.com</span>
          <h1>Member Portal</h1>
          <p>One workspace for club setup, meetings, role assignments, attendance, scoring, and student progress.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-heading">
            <h2>Sign in</h2>
            <p>Use your iLEAP Club member account.</p>
          </div>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : "Sign In"}</button>
          {import.meta.env.DEV ? <p className="login-note">Seed account for local testing: admin@ileapclub.com / ChangeMe123!</p> : null}
        </form>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }: { user: PortalUser; onLogout: () => void }) {
  const copy = roleCopy[user.role];
  const displayName = `${user.firstName} ${user.lastName}`;
  const initials = useMemo(() => `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase(), [user.firstName, user.lastName]);

  return (
    <main className="portal-shell">
      <aside className="portal-sidebar" aria-label="Portal navigation">
        <a className="portal-brand" href="#overview" aria-label="iLEAP Club member portal overview">
          <span>iL</span>
          <div>
            <strong>iLEAP Club</strong>
            <small>Members</small>
          </div>
        </a>
        <nav className="portal-nav">
          {roleNavItems[user.role].map((item) => (
            <a href={item.href} key={item.href}>{item.label}</a>
          ))}
        </nav>
        <div className="portal-sidebar-footer">
          <span>{formatRole(user.role)}</span>
          <small>member.ileapclub.com</small>
        </div>
      </aside>

      <div className="portal-content">
      <header className="portal-header" id="overview">
        <div>
          <p>member.ileapclub.com</p>
          <h1>{copy.title}</h1>
        </div>
        <div className="user-menu">
          <span>{initials}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{user.role.toLowerCase()}</small>
          </div>
          <button type="button" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">{user.role.replace("_", " ")}</p>
          <h2>Welcome back, {user.firstName}.</h2>
          <p>{copy.summary}</p>
        </div>
        <div className="status-card">
          <span>Today</span>
          <strong>Ready</strong>
          <p>Review meetings, assignments, attendance, scores, and band progress from one place.</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <PortalCard title="Primary Actions" items={copy.actions} />
        <PortalCard title="Important Reports" items={copy.reports} />
        <PortalCard title="Next Modules To Build" items={upcomingWork} />
      </section>

      {user.role === "ADMIN" ? <AdminWorkspace currentUser={user} /> : null}
      <MeetingWorkspace user={user} />
      <FeedbackReportPanel />
      {user.role === "STUDENT" ? <StudentProgressDashboard /> : null}
      </div>
    </main>
  );
}

function PortalCard({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="portal-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

type AdminUser = AdminOverview["users"][number];

function AdminWorkspace({ currentUser }: { currentUser: PortalUser }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUserRole, setNewUserRole] = useState<Role>("STUDENT");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editingUserRole, setEditingUserRole] = useState<Role>("STUDENT");

  async function refreshOverview() {
    const data = await getAdminOverview();
    setOverview(data);
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
    setEditingUser(portalUser);
    setEditingUserRole(portalUser.role);
    window.setTimeout(() => {
      document.getElementById(`edit-user-${portalUser.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        isActive: String(formData.get("isActive") || "true") === "true",
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
              <option value="STUDENT">Student</option>
              <option value="FACILITATOR">Facilitator</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label>
            Account Status
            <select name="isActive" defaultValue={String(portalUser.isActive)} disabled={isCurrentAdmin}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          {isCurrentAdmin ? (
            <>
              <input type="hidden" name="role" value="ADMIN" />
              <input type="hidden" name="isActive" value="true" />
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

  return (
    <section className="admin-workspace" id="admin" aria-label="Admin setup workspace">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Admin setup</p>
          <h2>Centres, clubs, users, and assignments</h2>
        </div>
        <button type="button" onClick={() => refreshOverview()} disabled={isLoading}>Refresh</button>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <div className="admin-summary-grid">
        <SummaryTile label="Centres" value={overview?.centres.length ?? 0} />
        <SummaryTile label="Clubs" value={overview?.clubs.length ?? 0} />
        <SummaryTile label="Users" value={overview?.users.length ?? 0} />
        <SummaryTile label="Students" value={overview?.students.length ?? 0} />
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
                <option value="STUDENT">Student</option>
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
                  <span>{club.program} - {club.studentMemberships?.length ?? 0} students - {club.facilitators?.length ?? 0} facilitators</span>
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
                    </div>
                    {editingUser?.id === portalUser.id ? renderEditUserForm(portalUser) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : <p>No users yet.</p>}
        </DataPanel>

        <DataPanel title="Student Assignments">
          {overview?.students.length ? (
            <ul className="record-list">
              {overview.students.map((student) => (
                <li key={student.id}>
                  <strong>{student.user.firstName} {student.user.lastName}</strong>
                  <span>{student.grade} - {formatProgramLevel(student.programLevel)} - {student.bandLevel} - {formatStudentClubs(student)}</span>
                </li>
              ))}
            </ul>
          ) : <p>No student assignments yet.</p>}
        </DataPanel>
      </div>
    </section>
  );
}

type MeetingMode = "view" | "book" | "manage" | "score" | "edit";

const meetingTemplates = [
  "Junior Regular Meeting",
  "Senior Regular Meeting",
  "Debate Meeting",
  "Town Hall Leadership Challenge",
  "Competition Meeting",
  "Special Event"
];

function MeetingWorkspace({ user }: { user: PortalUser }) {
  const [overview, setOverview] = useState<MeetingsOverview | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [meetingMode, setMeetingMode] = useState<MeetingMode>("view");
  const canManageMeetings = user.role === "ADMIN" || user.role === "FACILITATOR";
  const selectedMeeting = overview?.meetings.find((meeting) => meeting.id === selectedMeetingId) ?? overview?.meetings[0] ?? null;
  const selectedMeetingStudents = selectedMeeting && overview
    ? overview.students.filter((student) => isStudentInClub(student, selectedMeeting.clubId))
    : [];

  async function refreshMeetings() {
    const data = await getMeetingsOverview();
    setOverview(data);
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

  async function handleBulkMeetingGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const result = await createBulkMeetings({
        clubId: String(formData.get("clubId") || ""),
        titlePrefix: String(formData.get("titlePrefix") || ""),
        templateType: String(formData.get("templateType") || ""),
        startDate: String(formData.get("startDate") || ""),
        endDate: String(formData.get("endDate") || ""),
        dayOfWeek: Number(formData.get("dayOfWeek") || 0),
        startTime: String(formData.get("startTime") || ""),
        location: String(formData.get("location") || "")
      });
      form.reset();
      await refreshMeetings();
      setStatus(`${result.meetings.length} meetings generated.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to generate meetings.");
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

  return (
    <section className="meeting-workspace" id="meetings" aria-label="Meeting and role workspace">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Meetings</p>
          <h2>Meeting Builder and Role Claims</h2>
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
            <label>
              Template
              <select name="templateType" required>
                {meetingTemplates.map((template) => <option key={template}>{template}</option>)}
              </select>
            </label>
            <label>Date<input name="meetingDate" type="date" required /></label>
            <label>Start Time<input name="startTime" placeholder="10:00 AM" required /></label>
            <label>Location or Link<input name="location" placeholder="Ottawa Centre or online link" /></label>
            <p className="wide-field field-note">All standard iLEAP role slots are added automatically when the meeting is created.</p>
          </div>
          <button type="submit" disabled={isSubmitting || !overview?.clubs.length}>Create Meeting</button>
        </form>
      ) : null}

      {canManageMeetings ? (
        <form className="meeting-form" onSubmit={handleBulkMeetingGeneration}>
          <h3>Generate Term Meetings</h3>
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
            <label>Title Prefix<input name="titlePrefix" placeholder="Senior Regular Meeting" required /></label>
            <label>
              Template
              <select name="templateType" required>
                {meetingTemplates.map((template) => <option key={template}>{template}</option>)}
              </select>
            </label>
            <label>
              Day of Week
              <select name="dayOfWeek" required>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </label>
            <label>Start Date<input name="startDate" type="date" required /></label>
            <label>End Date<input name="endDate" type="date" required /></label>
            <label>Start Time<input name="startTime" placeholder="10:00 AM" required /></label>
            <label>Location or Link<input name="location" placeholder="Ottawa Centre or online link" /></label>
            <p className="wide-field field-note">Each generated meeting includes all standard iLEAP role slots automatically.</p>
          </div>
          <button type="submit" disabled={isSubmitting || !overview?.clubs.length}>Generate Meetings</button>
        </form>
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

          {meetingMode === "view" ? <MeetingView meeting={selectedMeeting} user={user} /> : null}
          {meetingMode === "book" ? (
            <BookRoles
              meeting={selectedMeeting}
              user={user}
              isSubmitting={isSubmitting}
              onClaim={(slotId) => updateMeeting(() => claimMeetingSlot(selectedMeeting.id, slotId), "Role claimed.")}
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
              isSubmitting={isSubmitting}
              onAddSlot={(roleDefinitionId, slotLabel) => updateMeeting(() => addMeetingRoleSlot(selectedMeeting.id, { roleDefinitionId, slotLabel }), "Role slot added.")}
              onAssign={(slotId, studentId) => updateMeeting(() => assignMeetingSlot(selectedMeeting.id, slotId, studentId), "Role assignment updated.")}
              onEditSlot={(slotId, payload) => updateMeeting(() => editMeetingRoleSlot(selectedMeeting.id, slotId, payload), "Role slot updated.")}
              onRemoveSlot={(slotId) => updateMeeting(() => removeMeetingRoleSlot(selectedMeeting.id, slotId), "Role slot removed.")}
              onToggleLock={() => updateMeeting(() => toggleMeetingLock(selectedMeeting.id), selectedMeeting.isRoleLocked ? "Roles reopened." : "Roles locked.")}
            />
          ) : null}
          {canManageMeetings && meetingMode === "score" ? (
            <ScoreFeedback
              meeting={selectedMeeting}
              isSubmitting={isSubmitting}
              onScore={(slotId, score, feedback) => updateMeeting(() => scoreMeetingSlot(selectedMeeting.id, slotId, { score, feedback }), "Score saved.")}
            />
          ) : null}
        </div>
      ) : null}

      {canManageMeetings && overview?.students.length ? (
        <RequirementManagementPanel
          students={overview.students}
          onUpdated={() => refreshMeetings()}
        />
      ) : null}
    </section>
  );
}

function MeetingList({
  meetings,
  user,
  isLoading,
  isSubmitting,
  selectedMeetingId,
  onSelect,
  onAgendaDownload
}: {
  meetings: Meeting[];
  user: PortalUser;
  isLoading: boolean;
  isSubmitting: boolean;
  selectedMeetingId: string;
  onSelect: (meeting: Meeting, mode: MeetingMode) => void;
  onAgendaDownload: (meeting: Meeting) => void;
}) {
  const canManage = user.role === "ADMIN" || user.role === "FACILITATOR";

  return (
    <div className="meeting-list-panel">
      <h3>Meeting List</h3>
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
                  <td>{meeting.startTime}</td>
                  <td>{meeting.location || "None"}</td>
                  <td><StatusText isLocked={meeting.isRoleLocked} /></td>
                  <td>
                    <div className="meeting-row-actions">
                      <button type="button" onClick={() => onSelect(meeting, "view")}>View</button>
                      <button type="button" onClick={() => onSelect(meeting, "book")}>Book Roles</button>
                      <button type="button" onClick={() => onAgendaDownload(meeting)} disabled={isSubmitting}>Download Agenda</button>
                      {canManage ? <button type="button" onClick={() => onSelect(meeting, "edit")}>Edit Meeting</button> : null}
                      {canManage ? <button type="button" onClick={() => onSelect(meeting, "manage")}>Manage Roles</button> : null}
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

function MeetingView({ meeting, user }: { meeting: Meeting; user: PortalUser }) {
  return (
    <section className="meeting-mode-section" aria-label="Meeting view">
      <MeetingSummary meeting={meeting} />
      <RoleAssignmentTable meeting={meeting} user={user} />
    </section>
  );
}

function BookRoles({
  meeting,
  user,
  isSubmitting,
  onClaim
}: {
  meeting: Meeting;
  user: PortalUser;
  isSubmitting: boolean;
  onClaim: (slotId: string) => void;
}) {
  const claimedCount = user.role === "STUDENT"
    ? meeting.roleSlots.filter((slot) => slot.assignedStudent?.user.id === user.id).length
    : 0;
  const openSlots = meeting.roleSlots.filter((slot) => !slot.assignedStudentId);
  const canBook = user.role === "STUDENT" && !meeting.isRoleLocked;

  return (
    <section className="meeting-mode-section" aria-label="Book roles">
      <MeetingSummary meeting={meeting} />
      <p className="field-note">You can claim up to 2 roles per meeting.</p>
      {meeting.isRoleLocked ? <p className="admin-status is-error">Role booking is locked for this meeting.</p> : null}
      {user.role !== "STUDENT" ? <p className="loading-state">Managers can review booking availability here. Use Manage Roles to assign students.</p> : null}
      <ul className="booking-list">
        {meeting.roleSlots.map((slot) => {
          const assignedName = slot.assignedStudent ? formatStudentName(slot.assignedStudent) : "";
          const isOwnRole = slot.assignedStudent?.user.id === user.id;
          const isAvailable = canBook && !slot.assignedStudentId && claimedCount < 2;

          return (
            <li key={slot.id} className={!slot.assignedStudentId ? "is-open" : ""}>
              <div>
                <strong>{roleSlotName(slot)}</strong>
                <span>{assignedName ? `Assigned to ${assignedName}` : "Available"}</span>
              </div>
              {isOwnRole ? <em>Claimed</em> : null}
              {!slot.assignedStudentId ? (
                <button type="button" onClick={() => onClaim(slot.id)} disabled={!isAvailable || isSubmitting}>
                  Claim
                </button>
              ) : null}
              {slot.assignedStudentId && !isOwnRole ? <em>Not available</em> : null}
            </li>
          );
        })}
      </ul>
      {!openSlots.length ? <p className="loading-state">No open roles are available for this meeting.</p> : null}
      {user.role === "STUDENT" && claimedCount >= 2 ? <p className="admin-status is-success">You have claimed 2 roles for this meeting.</p> : null}
    </section>
  );
}

function ManageRoles({
  meeting,
  roleDefinitions,
  students,
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
  isSubmitting: boolean;
  onAddSlot: (roleDefinitionId: string, slotLabel?: string) => void;
  onAssign: (slotId: string, studentId: string | null) => void;
  onEditSlot: (slotId: string, payload: { roleDefinitionId?: string; slotLabel?: string; sortOrder?: number }) => void;
  onRemoveSlot: (slotId: string) => void;
  onToggleLock: () => void;
}) {
  return (
    <section className="meeting-mode-section" aria-label="Manage roles">
      <MeetingSummary meeting={meeting} />
      <div className="manager-toolbar">
        <button type="button" onClick={onToggleLock} disabled={isSubmitting}>{meeting.isRoleLocked ? "Unlock Role Claims" : "Lock Role Claims"}</button>
        <StatusText isLocked={meeting.isRoleLocked} />
      </div>
      <AddRoleSlotControls roleDefinitions={roleDefinitions} isSubmitting={isSubmitting} onAddSlot={onAddSlot} />
      <div className="manager-role-list">
        {meeting.roleSlots.map((slot) => (
          <ManageRoleSlotRow
            key={slot.id}
            slot={slot}
            roleDefinitions={roleDefinitions}
            students={students}
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
  isSubmitting,
  onScore
}: {
  meeting: Meeting;
  isSubmitting: boolean;
  onScore: (slotId: string, score: number, feedback?: string) => void;
}) {
  const assignedSlots = meeting.roleSlots.filter((slot) => slot.assignedStudentId);

  return (
    <section className="meeting-mode-section" aria-label="Score feedback">
      <MeetingSummary meeting={meeting} />
      {!assignedSlots.length ? <p className="loading-state">Assign students to roles before scoring feedback.</p> : null}
      <div className="score-feedback-list">
        {assignedSlots.map((slot) => (
          <ScoreFeedbackRow
            key={slot.id}
            slot={slot}
            isSubmitting={isSubmitting}
            onScore={(score, feedback) => onScore(slot.id, score, feedback)}
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
  onSave: (payload: { clubId: string; title: string; templateType: string; meetingDate: string; startTime: string; location: string }) => void;
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
            <select name="templateType" defaultValue={meeting.templateType} required>
              {meetingTemplates.map((template) => <option key={template}>{template}</option>)}
            </select>
          </label>
          <label>Date<input name="meetingDate" type="date" defaultValue={dateInputValue(meeting.meetingDate)} required /></label>
          <label>Time<input name="startTime" defaultValue={meeting.startTime} required /></label>
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
        <p>{meeting.club.name} - {formatDate(meeting.meetingDate)} - {meeting.startTime} - {meeting.location || "None"}</p>
      </div>
      <StatusText isLocked={meeting.isRoleLocked} />
    </div>
  );
}

function RoleAssignmentTable({ meeting, user }: { meeting: Meeting; user: PortalUser }) {
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
            <RoleAssignmentRow key={slot.id} slot={slot} user={user} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleAssignmentRow({ slot, user }: { slot: Meeting["roleSlots"][number]; user: PortalUser }) {
  const canSeeScore = user.role !== "STUDENT" || slot.assignedStudent?.user.id === user.id;

  return (
    <tr>
      <td>{roleSlotName(slot)}</td>
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
  students,
  onUpdated
}: {
  students: MeetingsOverview["students"];
  onUpdated: () => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    setIsLoading(true);
    setError("");
    fetchStudentProgressForManager(selectedStudentId)
      .then(setProgress)
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
      const updatedProgress = await fetchStudentProgressForManager(selectedStudentId);
      setProgress(updatedProgress);
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
      const updatedProgress = await fetchStudentProgressForManager(selectedStudentId);
      setProgress(updatedProgress);
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
                  <strong>{entry.requirement.bandLevel}: {entry.requirement.requirementType} - {entry.requirement.name}</strong>
                  <span>{formatBandLadder(progress.summary.programLevel)} - {entry.requirement.description}</span>
                </div>
                <div className="requirement-controls">
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

function FeedbackReportPanel() {
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
      {!isLoading && !feedback.length ? <p className="loading-state">No scored role feedback yet.</p> : null}
      {feedback.length ? (
        <div className="feedback-table-wrap">
          <table className="feedback-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Club</th>
                <th>Meeting</th>
                <th>Role</th>
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
  isSubmitting,
  onEditSlot,
  onAssign,
  onRemoveSlot
}: {
  slot: Meeting["roleSlots"][number];
  roleDefinitions: MeetingsOverview["roleDefinitions"];
  students: MeetingsOverview["students"];
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

  return (
    <article className="manager-role-row">
      <div>
        <strong>{roleSlotName(slot)}</strong>
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
      <button type="button" className="danger-action" onClick={onRemoveSlot} disabled={isSubmitting || Boolean(slot.assignedStudentId || slot.score)}>Remove</button>
    </article>
  );
}

function ScoreFeedbackRow({
  slot,
  isSubmitting,
  onScore
}: {
  slot: Meeting["roleSlots"][number];
  isSubmitting: boolean;
  onScore: (score: number, feedback?: string) => void;
}) {
  const [score, setScore] = useState(String(slot.score?.score ?? ""));
  const [feedback, setFeedback] = useState(slot.score?.feedback ?? "");

  useEffect(() => {
    setScore(String(slot.score?.score ?? ""));
    setFeedback(slot.score?.feedback ?? "");
  }, [slot.id, slot.score?.score, slot.score?.feedback]);

  return (
    <article className="score-feedback-row">
      <div>
        <strong>{roleSlotName(slot)}</strong>
        <span>{slot.assignedStudent ? formatStudentName(slot.assignedStudent) : "None"}</span>
      </div>
      <label>
        Score
        <input type="number" min="0" max="100" value={score} placeholder="0-100" disabled={isSubmitting} onChange={(event) => setScore(event.currentTarget.value)} />
      </label>
      <label>
        Feedback
        <input
          value={feedback}
          placeholder="Comment"
          disabled={isSubmitting}
          onChange={(event) => setFeedback(event.currentTarget.value)}
        />
      </label>
      <button type="button" onClick={() => onScore(Number(score), feedback)} disabled={isSubmitting || !score}>Save Feedback</button>
    </article>
  );
}

function StudentProgressDashboard() {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getStudentProgress()
      .then(setProgress)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load progress."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section className="student-progress" id="progress" aria-label="Student progress dashboard">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">My progress</p>
          <h2>Student Progress Dashboard</h2>
        </div>
      </div>

      {isLoading ? <p className="loading-state">Loading progress...</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      {progress ? (
        <>
          <div className="progress-summary-grid">
            <SummaryTile label="Program Level" valueText={formatProgramLevel(progress.summary.programLevel)} />
            <SummaryTile label="Current Band" valueText={progress.summary.bandLevel} />
            <SummaryTile label="Band Ladder" valueText={formatBandLadder(progress.summary.programLevel)} />
            <SummaryTile label="Attendance" valueText={progress.summary.attendanceRate === null ? "N/A" : `${progress.summary.attendanceRate}%`} />
            <SummaryTile label="Roles Completed" value={progress.summary.rolesCompleted} />
            <SummaryTile label="Average Score" valueText={progress.summary.averageScore === null ? "N/A" : `${progress.summary.averageScore}`} />
          </div>
          {progress.summary.programLevelWarning ? <p className="admin-status is-error" role="alert">{progress.summary.programLevelWarning}</p> : null}

          <div className="student-context-card">
            <strong>{progress.summary.clubName}</strong>
            <span>{progress.summary.centreName} - {formatBandLadder(progress.summary.programLevel)}</span>
          </div>

          <DataPanel title="My Scores & Feedback">
            {progress.feedback.length ? (
              <div className="student-feedback-table-wrap">
                <table className="student-feedback-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Meeting</th>
                      <th>Role</th>
                      <th>Score</th>
                      <th>Feedback</th>
                      <th>Facilitator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.feedback.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.meetingDate)}</td>
                        <td>{entry.meetingTitle}<span>{entry.clubName}{entry.attendanceStatus ? ` - ${entry.attendanceStatus}` : ""}</span></td>
                        <td>{entry.roleName}</td>
                        <td>{entry.score}/100</td>
                        <td>{entry.feedback || "No feedback entered yet."}</td>
                        <td>{entry.facilitatorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p>No facilitator feedback yet.</p>}
          </DataPanel>

          <DataPanel title="Band Ladder Requirements">
            {progress.requirements.length ? (
              <ul className="requirement-list">
                {progress.requirements.map((entry) => (
                  <li key={entry.requirement.id} className={entry.isCompleted ? "is-complete" : ""}>
                    <div>
                      <strong>{entry.requirement.bandLevel}: {entry.requirement.requirementType} - {entry.requirement.name}</strong>
                      <span>
                        {entry.requirement.description}
                        {entry.facilitatorSignedOffAt ? ` - facilitator signed off ${formatDate(entry.facilitatorSignedOffAt)}` : ""}
                        {entry.adminOverrideAt ? ` - admin override ${formatDate(entry.adminOverrideAt)}` : ""}
                      </span>
                    </div>
                    <em>{entry.currentCount}/{entry.requirement.targetCount}</em>
                  </li>
                ))}
              </ul>
            ) : <p>No requirements configured yet.</p>}
          </DataPanel>

          <div className="student-progress-grid">
            <DataPanel title="Recent Role History">
              {progress.student.roleSlots.length ? (
                <ul className="record-list">
                  {progress.student.roleSlots.slice(0, 8).map((slot) => (
                    <li key={slot.id}>
                      <strong>{slot.roleDefinition.name}</strong>
                      <span>{slot.meeting.title} - {formatDate(slot.meeting.meetingDate)} - score: {slot.score?.score ?? "Not scored"}</span>
                    </li>
                  ))}
                </ul>
              ) : <p>No roles claimed yet.</p>}
            </DataPanel>

            <DataPanel title="Score Feedback">
              {progress.student.roleScores.length ? (
                <ul className="record-list">
                  {progress.student.roleScores.slice(0, 8).map((score) => (
                    <li key={score.id}>
                      <strong>{score.roleSlot.roleDefinition.name}: {score.score}/100</strong>
                      <span>{score.meeting.title} - {score.feedback || "No feedback entered yet."}</span>
                    </li>
                  ))}
                </ul>
              ) : <p>No scores yet.</p>}
            </DataPanel>

            <DataPanel title="Attendance History">
              {progress.student.attendance.length ? (
                <ul className="record-list">
                  {progress.student.attendance.slice(0, 8).map((attendance) => (
                    <li key={attendance.id}>
                      <strong>{attendance.status}</strong>
                      <span>{attendance.meeting.title} - {formatDate(attendance.meeting.meetingDate)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p>No attendance marked yet.</p>}
            </DataPanel>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SummaryTile({ label, value, valueText }: { label: string; value?: number; valueText?: string }) {
  return (
    <article className="summary-tile">
      <span>{label}</span>
      <strong>{valueText ?? value ?? 0}</strong>
    </article>
  );
}

function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="data-panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return <em className={isActive ? "status-badge is-active" : "status-badge is-inactive"}>{isActive ? "Active" : "Archived"}</em>;
}

function roleSlotName(slot: Meeting["roleSlots"][number]) {
  return slot.slotLabel || slot.roleDefinition.name;
}

function formatStudentName(student: { user: { firstName: string; lastName: string } }) {
  return `${student.user.firstName} ${student.user.lastName}`;
}

function dateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatProgramLevel(programLevel?: string | null) {
  if (programLevel === "JUNIOR") {
    return "Junior";
  }

  if (programLevel === "SENIOR") {
    return "Senior";
  }

  return "Not set";
}

function formatBandLadder(programLevel?: string | null) {
  if (programLevel === "JUNIOR") {
    return "Junior 14-Band";
  }

  if (programLevel === "SENIOR") {
    return "Senior 14-Band";
  }

  return "Program level not set";
}

function formatRole(role: Role) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function isStudentInClub(student: MeetingsOverview["students"][number], clubId: string) {
  return Boolean(student.clubMemberships?.some((membership) => membership.clubId === clubId && membership.status === "ACTIVE"));
}

function formatStudentClubs(student: MeetingsOverview["students"][number]) {
  const clubs = student.clubMemberships?.map((membership) => membership.club.name) ?? [];

  return clubs.length ? clubs.join(", ") : "No club";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}
