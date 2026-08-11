import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import ileapClubLogoUrl from "../../../assets/images/ileap-club-logo.jpg";
import {
  AdminOverview,
  addMeetingRoleSlot,
  assignClubFacilitator,
  assignMeetingSlot,
  BandDocument,
  backfillPreviousBandRequirements,
  claimMeetingSlot,
  clearToken,
  createBandDocument,
  createCentre,
  createClub,
  createMeeting,
  createResourceLink,
  createUser,
  deleteDemoUser,
  deleteSampleFeedback,
  deleteSampleUsers,
  downloadAgenda,
  editMeetingRoleSlot,
  fetchStudentProgressForManager,
  FeedbackReportEntry,
  getAdminOverview,
  getBandDocuments,
  getCurrentUser,
  getFeedbackReport,
  getMemberDetail,
  getMembers,
  getMeetingsOverview,
  getResourceLinks,
  getStoredToken,
  getStudentProgress,
  login,
  Meeting,
  MemberDetail,
  MemberListEntry,
  MembersResponse,
  MeetingsOverview,
  PortalUser,
  Role,
  saveStudentMeetingFeedback,
  removeMeetingRoleSlot,
  removeClubFacilitator,
  resetDemoMeetingData,
  ResourceLink,
  setCentreActive,
  setClubActive,
  setUserActive,
  storeToken,
  StudentProgress,
  toggleMeetingLock,
  updateBandDocument,
  updateMeetingDetails,
  updateResourceLink,
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

const documentCategoryOptions = [
  "Speech Guide",
  "Presentation Guide",
  "Worksheet",
  "Rubric",
  "Sample",
  "Training Material",
  "Other"
];

const resourceCategoryOptions = [
  "Role Guide",
  "Speech Guide",
  "Presentation Guide",
  "Video",
  "Sample",
  "Other"
];

const roleNavItems: Record<Role, Array<{ href: string; label: string }>> = {
  ADMIN: [
    { href: "#overview", label: "Overview" },
    { href: "#admin", label: "Setup" },
    { href: "#members", label: "Members" },
    { href: "#documents", label: "Documents" },
    { href: "#meetings", label: "Meetings" },
    { href: "#feedback", label: "Feedback" },
    { href: "#requirements", label: "Band Progress" }
  ],
  FACILITATOR: [
    { href: "#overview", label: "Overview" },
    { href: "#members", label: "Members" },
    { href: "#documents", label: "Documents" },
    { href: "#meetings", label: "Meetings" },
    { href: "#feedback", label: "Feedback" },
    { href: "#requirements", label: "Band Progress" }
  ],
  STUDENT: [
    { href: "#overview", label: "Overview" },
    { href: "#meetings", label: "Meetings" },
    { href: "#club-members", label: "My Club" },
    { href: "#resources", label: "Resources" },
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
          <div className="login-logo-lockup">
            <div className="login-logo-card">
              <img src={ileapClubLogoUrl} alt="iLEAP Club" />
            </div>
            <span>member.ileapclub.com</span>
          </div>
          <h1>iLEAP Club Member Portal</h1>
          <p className="login-tagline">Public Speaking • Leadership • Confidence</p>
          <p>Track meetings, role sign-ups, feedback, band progress, and learning resources in one place.</p>
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
          <span className="portal-brand-logo">
            <img src={ileapClubLogoUrl} alt="" aria-hidden="true" />
          </span>
          <div className="portal-brand-text">
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
      {user.role !== "STUDENT" ? <MembersWorkspace user={user} /> : null}
      <DocumentsWorkspace user={user} />
      <MeetingWorkspace user={user} />
      {user.role !== "STUDENT" ? <FeedbackReportPanel /> : null}
      {user.role === "STUDENT" ? <StudentClubMembersPanel /> : null}
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

      <section className="assignment-panel" aria-label="Demo and test data cleanup">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Demo/Test Data Cleanup</p>
            <h3>Remove Sample Data</h3>
          </div>
        </div>
        <p className="field-note">These actions only target sample/test records such as users with example.com email addresses or Sample in the name. Real member data should be deactivated, not deleted.</p>
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

function MembersWorkspace({ user }: { user: PortalUser }) {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
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
    setError("");
    setIsLoading(true);

    try {
      const result = await getMembers(nextFilters);
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load members.");
    } finally {
      setIsLoading(false);
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

  async function openDetail(studentId: string) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await getMemberDetail(studentId);
      setDetail(result.member);
      window.setTimeout(() => {
        document.getElementById("member-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Unable to load member detail.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateMemberStatus(member: MemberListEntry, isActive: boolean) {
    if (!member.userId) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
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

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const clubs = data?.clubs.filter((club) => !filters.centreId || club.centreId === filters.centreId) ?? [];

  return (
    <section className="members-workspace" id="members" aria-label="Members">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Members</p>
          <h2>Club Members</h2>
        </div>
        <button type="button" onClick={() => loadMembers()} disabled={isLoading}>Refresh</button>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

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
                  <th>Roles Completed</th>
                  <th>Average Score</th>
                  <th>Last Feedback Date</th>
                  <th>Status</th>
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
                    <td>{member.rolesCompleted ?? 0}</td>
                    <td>{member.averageScore === null || member.averageScore === undefined ? "N/A" : `${member.averageScore}/100`}</td>
                    <td>{member.lastFeedbackDate ? formatDate(member.lastFeedbackDate) : "None"}</td>
                    <td>{member.isActive === false ? "Inactive" : "Active"}</td>
                    <td>
                      <div className="meeting-row-actions">
                        <button type="button" onClick={() => openDetail(member.id)} disabled={isSubmitting}>View Details</button>
                        <button type="button" onClick={() => openDetail(member.id)} disabled={isSubmitting}>View Progress</button>
                        <button type="button" onClick={() => openDetail(member.id)} disabled={isSubmitting}>View Feedback</button>
                        {user.role === "ADMIN" ? <a className="text-action" href="#admin">Edit User</a> : null}
                        {user.role === "ADMIN" ? (
                          <button type="button" className="danger-action" onClick={() => updateMemberStatus(member, member.isActive === false)} disabled={isSubmitting}>
                            {member.isActive === false ? "Reactivate" : "Deactivate"}
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

        <DataPanel title="Personal Tracking Summary">
          {member.trackingSummary ? (
            <>
              <ul className="record-list">
                <li><strong>Completed requirements</strong><span>{member.trackingSummary.completedRequirements}</span></li>
                <li><strong>Remaining requirements</strong><span>{member.trackingSummary.remainingRequirements}</span></li>
              </ul>
              {canManage ? <button type="button" className="text-action" onClick={backfillBands} disabled={isSubmitting}>Backfill Previous Bands</button> : null}
            </>
          ) : <p>Private progress details are not available.</p>}
        </DataPanel>

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

type DocumentFilters = {
  programLevel: string;
  bandLevel: string;
  clubId: string;
  category: string;
  search: string;
  status: string;
};

function DocumentsWorkspace({ user }: { user: PortalUser }) {
  const isStudent = user.role === "STUDENT";

  return isStudent ? <StudentResourcesPanel /> : (
    <>
      <ManagerDocumentsPanel user={user} />
      <ManagerResourceLinksPanel user={user} />
    </>
  );
}

function ManagerDocumentsPanel({ user }: { user: PortalUser }) {
  const [documents, setDocuments] = useState<BandDocument[]>([]);
  const [clubs, setClubs] = useState<AdminOverview["clubs"]>([]);
  const [filters, setFilters] = useState<DocumentFilters>({
    programLevel: "",
    bandLevel: "",
    clubId: "",
    category: "",
    search: "",
    status: "ACTIVE"
  });
  const [editingDocument, setEditingDocument] = useState<BandDocument | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  async function refreshDocuments(nextFilters = filters) {
    const data = await getBandDocuments(nextFilters);
    setDocuments(data.documents);
    setClubs(data.clubs);
  }

  useEffect(() => {
    refreshDocuments()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load documents."))
      .finally(() => setIsLoading(false));
  }, []);

  function updateFilter(key: keyof DocumentFilters, value: string) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setError("");
    refreshDocuments(nextFilters).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to filter documents."));
  }

  async function handleCreateDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await createBandDocument({
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        fileUrl: String(formData.get("fileUrl") || ""),
        programLevel: String(formData.get("programLevel") || "SENIOR"),
        bandLevel: String(formData.get("bandLevel") || "White")
      });
      form.reset();
      await refreshDocuments();
      setIsAddFormOpen(false);
      setStatus("Document added.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to add document.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveDocument(documentId: string, payload: Parameters<typeof updateBandDocument>[1]) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await updateBandDocument(documentId, payload);
      await refreshDocuments();
      setEditingDocument(null);
      setStatus("Document updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update document.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(document: BandDocument) {
    const nextStatus = document.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
    await handleSaveDocument(document.id, { status: nextStatus });
  }

  return (
    <section className="documents-workspace" id="documents" aria-label="Band document resources">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Learning resources</p>
          <h2>Documents</h2>
        </div>
        <button type="button" onClick={() => refreshDocuments()} disabled={isLoading}>Refresh</button>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <div className="document-section-heading">
        <h3>Find Existing Documents</h3>
      </div>
      <form className="document-filter-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Program
          <select value={filters.programLevel} onChange={(event) => updateFilter("programLevel", event.currentTarget.value)}>
            <option value="">All programs</option>
            {programLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Band
          <select value={filters.bandLevel} onChange={(event) => updateFilter("bandLevel", event.currentTarget.value)}>
            <option value="">All bands</option>
            {bandLevelOptions.map((bandLevel) => <option key={bandLevel} value={bandLevel}>{bandLevel}</option>)}
          </select>
        </label>
        <label>
          Club
          <select value={filters.clubId} onChange={(event) => updateFilter("clubId", event.currentTarget.value)}>
            <option value="">All visible clubs</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <label>
          Category
          <select value={filters.category} onChange={(event) => updateFilter("category", event.currentTarget.value)}>
            <option value="">All categories</option>
            {documentCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        {user.role === "ADMIN" ? (
          <label>
            Status
            <select value={filters.status} onChange={(event) => updateFilter("status", event.currentTarget.value)}>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
              <option value="">All statuses</option>
            </select>
          </label>
        ) : null}
        <label>
          Search
          <input value={filters.search} placeholder="Title" onChange={(event) => updateFilter("search", event.currentTarget.value)} />
        </label>
      </form>

      <div className="document-add-toggle">
        <button type="button" onClick={() => setIsAddFormOpen((isOpen) => !isOpen)}>
          {isAddFormOpen ? "Cancel New Document" : "Add New Document"}
        </button>
      </div>

      {isAddFormOpen ? (
        <form className="document-form" onSubmit={handleCreateDocument}>
          <h3>Add New Document</h3>
          <label>Document Title<input name="title" required /></label>
          <label>Description <span>Optional</span><textarea name="description" rows={3} /></label>
          <label>
            Program Level for this resource
            <select name="programLevel" defaultValue="SENIOR">
              {programLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Band Level for this resource
            <select name="bandLevel" defaultValue="White">
              {bandLevelOptions.map((bandLevel) => <option key={bandLevel} value={bandLevel}>{bandLevel}</option>)}
            </select>
          </label>
          <label className="document-link-field">
            Document Link <span>Optional</span>
            <input name="fileUrl" type="url" placeholder="Paste Google Drive, PDF, or website link" />
          </label>
          <p className="document-helper">You can paste a Google Drive, PDF, DOCX, PPTX, or website link now. File upload will be added later.</p>
          <button type="submit" disabled={isSubmitting}>Add Document</button>
        </form>
      ) : null}

      {isLoading ? <p className="loading-state">Loading documents...</p> : null}
      {!isLoading && !documents.length ? <p className="loading-state">No documents found.</p> : null}

      <div className="document-card-grid">
        {documents.map((document) => (
          <ManagerDocumentCard
            key={document.id}
            document={document}
            clubs={clubs}
            canEdit={user.role === "ADMIN"}
            isEditing={editingDocument?.id === document.id}
            isSubmitting={isSubmitting}
            onEdit={() => setEditingDocument(document)}
            onCancelEdit={() => setEditingDocument(null)}
            onSave={handleSaveDocument}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </section>
  );
}

function ManagerDocumentCard({
  document,
  clubs,
  canEdit,
  isEditing,
  isSubmitting,
  onEdit,
  onCancelEdit,
  onSave,
  onStatusChange
}: {
  document: BandDocument;
  clubs: AdminOverview["clubs"];
  canEdit: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (documentId: string, payload: Parameters<typeof updateBandDocument>[1]) => void;
  onStatusChange: (document: BandDocument) => void;
}) {
  const link = documentLink(document);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    onSave(document.id, {
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || ""),
      fileUrl: String(formData.get("fileUrl") || ""),
      programLevel: String(formData.get("programLevel") || "SENIOR"),
      bandLevel: String(formData.get("bandLevel") || "White"),
      clubId: String(formData.get("clubId") || "") || null,
      category: String(formData.get("category") || "Other")
    });
  }

  return (
    <article className={`document-card ${document.status === "ARCHIVED" ? "is-archived" : ""}`}>
      {isEditing ? (
        <form className="document-edit-form" onSubmit={handleSubmit}>
          <label>Document Title<input name="title" defaultValue={document.title} required /></label>
          <label>Description<textarea name="description" defaultValue={document.description ?? ""} rows={3} /></label>
          <label>Document Link<input name="fileUrl" type="url" defaultValue={document.fileUrl} placeholder="Paste Google Drive, PDF, or website link" /></label>
          <label>
            Program
            <select name="programLevel" defaultValue={document.programLevel}>
              {programLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Band
            <select name="bandLevel" defaultValue={document.bandLevel}>
              {bandLevelOptions.map((bandLevel) => <option key={bandLevel} value={bandLevel}>{bandLevel}</option>)}
            </select>
          </label>
          <label>
            Club
            <select name="clubId" defaultValue={document.clubId ?? ""}>
              <option value="">All clubs</option>
              {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
            </select>
          </label>
          <label>
            Category
            <select name="category" defaultValue={document.category}>
              {documentCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <div className="document-actions">
            <button type="submit" disabled={isSubmitting}>Save</button>
            <button type="button" onClick={onCancelEdit} disabled={isSubmitting}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="document-card-header">
            <div>
              <span>{document.category}</span>
              <h3>{document.title}</h3>
            </div>
            <em>{document.status === "ARCHIVED" ? "Archived" : "Active"}</em>
          </div>
          <p>{document.description || "No description provided."}</p>
          <dl className="document-meta">
            <div><dt>Program</dt><dd>{formatProgramLevel(document.programLevel)}</dd></div>
            <div><dt>Band</dt><dd>{document.bandLevel}</dd></div>
            <div><dt>Status</dt><dd>{document.status === "ARCHIVED" ? "Archived" : "Active"}</dd></div>
          </dl>
          {!link ? <p className="document-link-missing">Link not added yet</p> : null}
          <div className="document-actions">
            {link
              ? <a href={link} target="_blank" rel="noreferrer">Open / Download</a>
              : <span className="document-disabled-action">Open / Download</span>}
            {canEdit ? <button type="button" onClick={onEdit}>Edit</button> : null}
            {canEdit ? (
              <button type="button" onClick={() => onStatusChange(document)} disabled={isSubmitting}>
                {document.status === "ARCHIVED" ? "Restore" : "Archive"}
              </button>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}

function StudentResourcesPanel() {
  const [documents, setDocuments] = useState<BandDocument[]>([]);
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLink | null>(null);
  const [studentContext, setStudentContext] = useState<Awaited<ReturnType<typeof getBandDocuments>>["studentContext"]>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getBandDocuments(), getResourceLinks()])
      .then(([documentResult, resourceResult]) => {
        setDocuments(documentResult.documents);
        setResources(resourceResult.resources);
        setStudentContext(documentResult.studentContext ?? null);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load resources."))
      .finally(() => setIsLoading(false));
  }, []);

  const currentBandResources = documents.filter((document) => document.bandLevel === studentContext?.currentBandLevel);
  const previousBandResources = documents.filter((document) => document.bandLevel !== studentContext?.currentBandLevel);

  return (
    <section className="documents-workspace" id="resources" aria-label="Student band resources">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Learning resources</p>
          <h2>My Band Resources</h2>
        </div>
      </div>

      {isLoading ? <p className="loading-state">Loading resources...</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      {studentContext ? (
        <div className="progress-summary-grid">
          <SummaryTile label="Program Level" valueText={formatProgramLevel(studentContext.programLevel)} />
          <SummaryTile label="Current Band" valueText={studentContext.currentBandLevel} />
          <SummaryTile label="Band Ladder" valueText={formatBandLadder(studentContext.programLevel)} />
        </div>
      ) : null}

      {!isLoading && !studentContext?.programLevel ? (
        <p className="admin-status is-error" role="alert">Program level not set. Please ask Admin or Facilitator to set Junior or Senior.</p>
      ) : null}

      <ResourceGroup title="Current Band Resources" documents={currentBandResources} emptyText="No resources for your current band yet." />
      <ResourceGroup title="Previous Band Resources" documents={previousBandResources} emptyText="No previous band resources available yet." />
      <ResourceHelpGroup resources={resources} onSelectResource={setSelectedResource} />
      <ResourcePanel resource={selectedResource} onClose={() => setSelectedResource(null)} />
    </section>
  );
}

function ResourceHelpGroup({
  resources,
  onSelectResource
}: {
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
}) {
  return (
    <DataPanel title="Role & Requirement Help">
      {resources.length ? (
        <div className="resource-chip-list">
          {resources.map((resource) => (
            <button
              key={resource.id}
              type="button"
              className="resource-chip"
              title={resource.explanation}
              onClick={() => onSelectResource(resource)}
            >
              {resource.title}
            </button>
          ))}
        </div>
      ) : <p>No help links available yet.</p>}
    </DataPanel>
  );
}

function ResourceGroup({ title, documents, emptyText }: { title: string; documents: BandDocument[]; emptyText: string }) {
  return (
    <DataPanel title={title}>
      {documents.length ? (
        <div className="document-card-grid compact">
          {documents.map((document) => (
            <ResourceCard key={document.id} document={document} />
          ))}
        </div>
      ) : <p>{emptyText}</p>}
    </DataPanel>
  );
}

function ResourceCard({ document }: { document: BandDocument }) {
  const link = documentLink(document);

  return (
    <article className="document-card">
      <div className="document-card-header">
        <div>
          <span>{document.category}</span>
          <h3>{document.title}</h3>
        </div>
      </div>
      <p>{document.description || "No description provided."}</p>
      <dl className="document-meta">
        <div><dt>Program</dt><dd>{formatProgramLevel(document.programLevel)}</dd></div>
        <div><dt>Band</dt><dd>{document.bandLevel}</dd></div>
      </dl>
      {!link ? <p className="document-link-missing">Resource link not added yet.</p> : null}
      <div className="document-actions">
        {link
          ? <a href={link} target="_blank" rel="noreferrer">Open / Download</a>
          : <span className="document-disabled-action">Coming soon</span>}
      </div>
    </article>
  );
}

type ResourceFilters = {
  category: string;
  search: string;
  status: string;
};

function ManagerResourceLinksPanel({ user }: { user: PortalUser }) {
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [filters, setFilters] = useState<ResourceFilters>({ category: "", search: "", status: "ACTIVE" });
  const [editingResource, setEditingResource] = useState<ResourceLink | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const canEdit = user.role === "ADMIN";

  async function refreshResources(nextFilters = filters) {
    const data = await getResourceLinks(nextFilters);
    setResources(data.resources);
  }

  useEffect(() => {
    refreshResources()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load resource links."))
      .finally(() => setIsLoading(false));
  }, []);

  function updateFilter(key: keyof ResourceFilters, value: string) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setError("");
    refreshResources(nextFilters).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to filter resource links."));
  }

  async function handleCreateResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = resourcePayloadFromForm(event.currentTarget);
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await createResourceLink(payload);
      event.currentTarget.reset();
      await refreshResources();
      setIsAddFormOpen(false);
      setStatus("Resource link added.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to add resource link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveResource(resourceId: string, payload: Parameters<typeof updateResourceLink>[1]) {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await updateResourceLink(resourceId, payload);
      await refreshResources();
      setEditingResource(null);
      setStatus("Resource link updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update resource link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="documents-workspace" id="resource-links" aria-label="Role and band resource help links">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Inline help</p>
          <h2>Resource Help Links</h2>
        </div>
        <button type="button" onClick={() => refreshResources()} disabled={isLoading}>Refresh</button>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <form className="document-filter-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Category
          <select value={filters.category} onChange={(event) => updateFilter("category", event.currentTarget.value)}>
            <option value="">All categories</option>
            {resourceCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        {user.role === "ADMIN" ? (
          <label>
            Status
            <select value={filters.status} onChange={(event) => updateFilter("status", event.currentTarget.value)}>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
              <option value="">All statuses</option>
            </select>
          </label>
        ) : null}
        <label>
          Search
          <input value={filters.search} placeholder="Title" onChange={(event) => updateFilter("search", event.currentTarget.value)} />
        </label>
      </form>

      {canEdit ? (
        <div className="document-add-toggle">
          <button type="button" onClick={() => setIsAddFormOpen((isOpen) => !isOpen)}>
            {isAddFormOpen ? "Cancel New Resource" : "Add Resource Link"}
          </button>
        </div>
      ) : null}

      {canEdit && isAddFormOpen ? <ResourceLinkForm isSubmitting={isSubmitting} onSubmit={handleCreateResource} /> : null}
      {isLoading ? <p className="loading-state">Loading resource links...</p> : null}
      {!isLoading && !resources.length ? <p className="loading-state">No resource links found.</p> : null}

      <div className="document-card-grid">
        {resources.map((resource) => (
          <ResourceLinkCard
            key={resource.id}
            resource={resource}
            canEdit={canEdit}
            isEditing={editingResource?.id === resource.id}
            isSubmitting={isSubmitting}
            onEdit={() => setEditingResource(resource)}
            onCancelEdit={() => setEditingResource(null)}
            onSave={handleSaveResource}
            onStatusChange={(targetResource) => handleSaveResource(targetResource.id, {
              status: targetResource.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED"
            })}
          />
        ))}
      </div>
    </section>
  );
}

function ResourceLinkCard({
  resource,
  canEdit,
  isEditing,
  isSubmitting,
  onEdit,
  onCancelEdit,
  onSave,
  onStatusChange
}: {
  resource: ResourceLink;
  canEdit: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (resourceId: string, payload: Parameters<typeof updateResourceLink>[1]) => void;
  onStatusChange: (resource: ResourceLink) => void;
}) {
  if (isEditing) {
    return (
      <article className="document-card">
        <ResourceLinkForm
          resource={resource}
          isSubmitting={isSubmitting}
          onSubmit={(event) => {
            event.preventDefault();
            onSave(resource.id, resourcePayloadFromForm(event.currentTarget));
          }}
          onCancel={onCancelEdit}
        />
      </article>
    );
  }

  return (
    <article className={`document-card ${resource.status === "ARCHIVED" ? "is-archived" : ""}`}>
      <div className="document-card-header">
        <div>
          <span>{resource.category}</span>
          <h3>{resource.title}</h3>
        </div>
        <em>{resource.status === "ARCHIVED" ? "Archived" : "Active"}</em>
      </div>
      <p>{resource.explanation}</p>
      <dl className="document-meta">
        <div><dt>Role</dt><dd>{resource.roleKey || "Any"}</dd></div>
        <div><dt>Program</dt><dd>{formatProgramLevel(resource.programLevel)}</dd></div>
        <div><dt>Band</dt><dd>{resource.bandLevel || "Any"}</dd></div>
        <div><dt>Requirement</dt><dd>{resource.requirementName || resource.requirementId || "Any"}</dd></div>
      </dl>
      <ResourceActions resource={resource} />
      {canEdit ? (
        <div className="document-actions">
          <button type="button" onClick={onEdit}>Edit</button>
          <button type="button" onClick={() => onStatusChange(resource)} disabled={isSubmitting}>
            {resource.status === "ARCHIVED" ? "Restore" : "Archive"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ResourceLinkForm({
  resource,
  isSubmitting,
  onSubmit,
  onCancel
}: {
  resource?: ResourceLink;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  return (
    <form className="document-form resource-link-form" onSubmit={onSubmit}>
      <h3>{resource ? "Edit Resource Link" : "Add Resource Link"}</h3>
      <label>Title<input name="title" defaultValue={resource?.title ?? ""} required /></label>
      <label>
        Category
        <select name="category" defaultValue={resource?.category ?? "Role Guide"}>
          {resourceCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>Role Key <span>Optional</span><input name="roleKey" defaultValue={resource?.roleKey ?? ""} placeholder="iChair" /></label>
      <label>
        Program <span>Optional</span>
        <select name="programLevel" defaultValue={resource?.programLevel ?? ""}>
          <option value="">Any program</option>
          {programLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        Band <span>Optional</span>
        <select name="bandLevel" defaultValue={resource?.bandLevel ?? ""}>
          <option value="">Any band</option>
          {bandLevelOptions.map((bandLevel) => <option key={bandLevel} value={bandLevel}>{bandLevel}</option>)}
        </select>
      </label>
      <label>Requirement ID <span>Optional</span><input name="requirementId" defaultValue={resource?.requirementId ?? ""} /></label>
      <label className="document-link-field">YouTube URL <span>Optional</span><input name="youtubeUrl" type="url" defaultValue={resource?.youtubeUrl ?? ""} /></label>
      <label className="document-link-field">Document URL <span>Optional</span><input name="documentUrl" type="url" defaultValue={resource?.documentUrl ?? ""} /></label>
      <label className="document-link-field">Short Explanation<textarea name="explanation" defaultValue={resource?.explanation ?? ""} rows={3} required /></label>
      <div className="document-actions">
        <button type="submit" disabled={isSubmitting}>{resource ? "Save Resource" : "Add Resource"}</button>
        {onCancel ? <button type="button" onClick={onCancel} disabled={isSubmitting}>Cancel</button> : null}
      </div>
    </form>
  );
}

function resourcePayloadFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);

  return {
    title: String(formData.get("title") || ""),
    explanation: String(formData.get("explanation") || ""),
    youtubeUrl: String(formData.get("youtubeUrl") || ""),
    documentUrl: String(formData.get("documentUrl") || ""),
    programLevel: String(formData.get("programLevel") || "") || null,
    bandLevel: String(formData.get("bandLevel") || "") || null,
    roleKey: String(formData.get("roleKey") || "") || null,
    requirementId: String(formData.get("requirementId") || "") || null,
    category: String(formData.get("category") || "Other")
  };
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
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLink | null>(null);
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

          {meetingMode === "view" ? <MeetingView meeting={selectedMeeting} user={user} resources={resources} onSelectResource={setSelectedResource} /> : null}
          {meetingMode === "book" ? (
            <BookRoles
              meeting={selectedMeeting}
              user={user}
              resources={resources}
              onSelectResource={setSelectedResource}
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
              resources={resources}
              onSelectResource={setSelectedResource}
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
          students={overview.students}
          resources={resources}
          onSelectResource={setSelectedResource}
          onUpdated={() => refreshMeetings()}
        />
      ) : null}
      <ResourcePanel resource={selectedResource} onClose={() => setSelectedResource(null)} />
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
  onClaim
}: {
  meeting: Meeting;
  user: PortalUser;
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
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
  students,
  resources,
  onSelectResource,
  onUpdated
}: {
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

function StudentClubMembersPanel() {
  const [members, setMembers] = useState<MemberListEntry[]>([]);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMembers({ pageSize: 50, status: "active" })
      .then((result) => setMembers(result.members))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load club members."))
      .finally(() => setIsLoading(false));
  }, []);

  async function openPublicDetail(studentId: string) {
    setError("");

    try {
      const result = await getMemberDetail(studentId);
      setDetail(result.member);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Unable to load member detail.");
    }
  }

  return (
    <section className="student-progress" id="club-members" aria-label="Student club members">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">My club</p>
          <h2>Club Members</h2>
        </div>
      </div>

      {isLoading ? <p className="loading-state">Loading club members...</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {!isLoading && !members.length ? <p className="loading-state">No active club members found.</p> : null}

      {members.length ? (
        <div className="student-feedback-table-wrap">
          <table className="student-feedback-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Current Band</th>
                <th>Program Level</th>
                <th>Club</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => (
                <tr key={`${member.clubName}-${member.displayName}-${index}`}>
                  <td><button type="button" className="link-button" onClick={() => openPublicDetail(member.id)}>{member.displayName}</button></td>
                  <td>{member.currentBandLevel}</td>
                  <td>{formatProgramLevel(member.programLevel)}</td>
                  <td>{member.clubName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <div className="member-detail-panel">
          <div className="admin-heading">
            <div>
              <p className="eyebrow">Public profile</p>
              <h3>{detail.displayName}</h3>
            </div>
            <button type="button" onClick={() => setDetail(null)}>Close</button>
          </div>
          <div className="progress-summary-grid">
            <SummaryTile label="Program Level" valueText={formatProgramLevel(detail.programLevel)} />
            <SummaryTile label="Current Band" valueText={detail.currentBandLevel} />
            <SummaryTile label="Club" valueText={detail.clubs.map((club) => club.name).join(", ") || "No club"} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StudentProgressDashboard() {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLink | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStudentProgress(), getResourceLinks()])
      .then(([progressResult, resourceResult]) => {
        setProgress(progressResult);
        setResources(resourceResult.resources);
      })
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
                      <th>Club</th>
                      <th>Related Roles</th>
                      <th>Score</th>
                      <th>Feedback</th>
                      <th>Facilitator</th>
                      <th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.feedback.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.meetingDate)}</td>
                        <td>{entry.meetingTitle}</td>
                        <td>{entry.clubName}</td>
                        <td>{entry.roleName}</td>
                        <td>{entry.score}/100</td>
                        <td>{entry.feedback || "No feedback entered yet."}</td>
                        <td>{entry.facilitatorName}</td>
                        <td>{entry.attendanceStatus ?? "Not marked"}</td>
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
                      <strong>
                        {entry.requirement.bandLevel}: {entry.requirement.requirementType} -{" "}
                        <HelpLabel
                          label={entry.requirement.name}
                          resources={resourcesForRequirement(resources, entry.requirement.id, entry.requirement.name)}
                          onSelectResource={setSelectedResource}
                        />
                      </strong>
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
                      <strong>
                        <HelpLabel
                          label={slot.roleDefinition.name}
                          resources={resourcesForRoleName(resources, slot.roleDefinition.name)}
                          onSelectResource={setSelectedResource}
                        />
                      </strong>
                      <span>{slot.meeting.title} - {formatDate(slot.meeting.meetingDate)} - score: {slot.score?.score ?? "Not scored"}</span>
                    </li>
                  ))}
                </ul>
              ) : <p>No roles claimed yet.</p>}
            </DataPanel>

            <DataPanel title="Role-Specific Scores">
              {progress.student.roleScores.length ? (
                <ul className="record-list">
                  {progress.student.roleScores.slice(0, 8).map((score) => (
                    <li key={score.id}>
                      <strong>
                        <HelpLabel
                          label={`${score.roleSlot.roleDefinition.name}: ${score.score}/100`}
                          resources={resourcesForRoleName(resources, score.roleSlot.roleDefinition.name)}
                          onSelectResource={setSelectedResource}
                        />
                      </strong>
                      <span>{score.meeting.title} - {score.feedback || "No feedback entered yet."}</span>
                    </li>
                  ))}
                </ul>
              ) : <p>No role-specific scores yet.</p>}
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
      <ResourcePanel resource={selectedResource} onClose={() => setSelectedResource(null)} />
    </section>
  );
}

function HelpLabel({
  label,
  resources,
  onSelectResource
}: {
  label: string;
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
}) {
  const firstResource = resources[0];

  return (
    <span className="help-label">
      <span>{label}</span>
      {firstResource ? (
        <button
          type="button"
          className="help-icon"
          title={firstResource.explanation}
          aria-label={`Open help for ${label}`}
          onClick={() => onSelectResource(firstResource)}
        >
          i
        </button>
      ) : null}
    </span>
  );
}

function ResourcePanel({ resource, onClose }: { resource: ResourceLink | null; onClose: () => void }) {
  if (!resource) {
    return null;
  }

  return (
    <div className="resource-panel-backdrop" role="presentation" onClick={onClose}>
      <section className="resource-panel" role="dialog" aria-modal="true" aria-labelledby="resource-panel-title" onClick={(event) => event.stopPropagation()}>
        <div className="resource-panel-header">
          <div>
            <p className="eyebrow">{resource.category}</p>
            <h3 id="resource-panel-title">{resource.title}</h3>
          </div>
          <button type="button" aria-label="Close help panel" onClick={onClose}>Close</button>
        </div>
        <p>{resource.explanation}</p>
        <dl className="document-meta">
          <div><dt>Role</dt><dd>{resource.roleKey || "Any"}</dd></div>
          <div><dt>Program</dt><dd>{formatProgramLevel(resource.programLevel)}</dd></div>
          <div><dt>Band</dt><dd>{resource.bandLevel || "Any"}</dd></div>
          <div><dt>Requirement</dt><dd>{resource.requirementName || "Any"}</dd></div>
        </dl>
        <ResourceActions resource={resource} />
      </section>
    </div>
  );
}

function ResourceActions({ resource }: { resource: ResourceLink }) {
  return (
    <div className="document-actions">
      {resource.youtubeUrl
        ? <a href={resource.youtubeUrl} target="_blank" rel="noreferrer">Open YouTube</a>
        : null}
      {resource.documentUrl
        ? <a href={resource.documentUrl} target="_blank" rel="noreferrer">Open Document</a>
        : null}
      {!resource.youtubeUrl && !resource.documentUrl ? <span className="document-disabled-action">Links not added yet</span> : null}
    </div>
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

function isDemoUser(user: { id: string; email: string; firstName: string; lastName: string; role: Role }, currentUserId: string) {
  if (user.id === currentUserId || user.role === "ADMIN") {
    return false;
  }

  const marker = `${user.email} ${user.firstName} ${user.lastName}`.toLowerCase();

  return marker.includes("example.com") || marker.includes("sample");
}

function formatCleanupSummary(prefix: string, result: unknown) {
  if (!result || typeof result !== "object") {
    return prefix;
  }

  const entries = Object.entries(result)
    .filter(([, value]) => typeof value === "number" || typeof value === "string")
    .map(([key, value]) => `${formatSummaryKey(key)}: ${value}`);

  return entries.length ? `${prefix} ${entries.join(", ")}.` : prefix;
}

function formatSummaryKey(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function roleSlotName(slot: Meeting["roleSlots"][number]) {
  return slot.slotLabel || slot.roleDefinition.name;
}

function resourcesForRole(resources: ResourceLink[], slot: Meeting["roleSlots"][number]) {
  return resourcesForRoleName(resources, roleSlotName(slot), slot.roleDefinition.name);
}

function resourcesForRoleName(resources: ResourceLink[], roleName: string, definitionName = roleName) {
  const normalizedRoleName = normalizeResourceKey(roleName);
  const normalizedDefinitionName = normalizeResourceKey(definitionName);

  return resources.filter((resource) => {
    if (!resource.roleKey) {
      return false;
    }

    const resourceKey = normalizeResourceKey(resource.roleKey);

    return normalizedRoleName === resourceKey
      || normalizedDefinitionName === resourceKey
      || normalizedRoleName.startsWith(`${resourceKey} `)
      || normalizedDefinitionName.startsWith(`${resourceKey} `);
  });
}

function resourcesForRequirement(resources: ResourceLink[], requirementId: string, requirementName: string) {
  const normalizedRequirementName = normalizeResourceKey(requirementName);

  return resources.filter((resource) => {
    if (resource.requirementId === requirementId) {
      return true;
    }

    if (!resource.requirementName && !resource.title) {
      return false;
    }

    return normalizeResourceKey(resource.requirementName ?? resource.title).includes(normalizedRequirementName)
      || normalizedRequirementName.includes(normalizeResourceKey(resource.requirementName ?? resource.title));
  });
}

function normalizeResourceKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+\d+$/g, "")
    .replace(/\s+/g, " ");
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

function documentLink(document: { fileUrl?: string | null }) {
  return document.fileUrl?.trim() || "";
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
