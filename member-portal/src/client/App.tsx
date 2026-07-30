import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AdminOverview,
  assignMeetingSlot,
  claimMeetingSlot,
  clearToken,
  createBulkMeetings,
  createCentre,
  createClub,
  createMeeting,
  createUser,
  downloadAgenda,
  fetchStudentProgressForManager,
  FeedbackReportEntry,
  getAdminOverview,
  getCurrentUser,
  getFeedbackReport,
  getMeetingsOverview,
  getStoredToken,
  getStudentProgress,
  login,
  markMeetingAttendance,
  Meeting,
  MeetingAttendance,
  MeetingsOverview,
  PortalUser,
  Role,
  scoreMeetingSlot,
  setCentreActive,
  setClubActive,
  storeToken,
  StudentProgress,
  toggleMeetingLock,
  updateStudentRequirement
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
  "Attendance, scoring, and PTB requirements"
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

      {user.role === "ADMIN" ? <AdminWorkspace /> : null}
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

function AdminWorkspace() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUserRole, setNewUserRole] = useState<Role>("STUDENT");

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
            <ul className="record-list">
              {overview.users.map((portalUser) => (
                <li key={portalUser.id}><strong>{portalUser.firstName} {portalUser.lastName}</strong><span>{formatRole(portalUser.role)} - {portalUser.email}</span></li>
              ))}
            </ul>
          ) : <p>No users yet.</p>}
        </DataPanel>

        <DataPanel title="Student Assignments">
          {overview?.students.length ? (
            <ul className="record-list">
              {overview.students.map((student) => (
                <li key={student.id}>
                  <strong>{student.user.firstName} {student.user.lastName}</strong>
                  <span>{student.grade} - {formatStudentClubs(student)}</span>
                </li>
              ))}
            </ul>
          ) : <p>No student assignments yet.</p>}
        </DataPanel>
      </div>
    </section>
  );
}

function MeetingWorkspace({ user }: { user: PortalUser }) {
  const [overview, setOverview] = useState<MeetingsOverview | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManageMeetings = user.role === "ADMIN" || user.role === "FACILITATOR";

  async function refreshMeetings() {
    const data = await getMeetingsOverview();
    setOverview(data);
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
                <option>Junior Regular Meeting</option>
                <option>Senior Regular Meeting</option>
                <option>Debate Meeting</option>
                <option>Town Hall Leadership Challenge</option>
                <option>Competition Meeting</option>
                <option>Special Event</option>
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
                <option>Junior Regular Meeting</option>
                <option>Senior Regular Meeting</option>
                <option>Debate Meeting</option>
                <option>Town Hall Leadership Challenge</option>
                <option>Competition Meeting</option>
                <option>Special Event</option>
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

      <div className="meeting-list">
        {isLoading ? <p>Loading meetings...</p> : null}
        {!isLoading && !overview?.meetings.length ? <p>No meetings yet.</p> : null}
        {overview?.meetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            students={overview.students.filter((student) => isStudentInClub(student, meeting.clubId))}
            user={user}
            isSubmitting={isSubmitting}
            onClaim={(slotId) => updateMeeting(() => claimMeetingSlot(meeting.id, slotId), "Role claimed.")}
            onAssign={(slotId, studentId) => updateMeeting(() => assignMeetingSlot(meeting.id, slotId, studentId), "Role assignment updated.")}
            onAttendance={(studentId, status) => updateMeeting(() => markMeetingAttendance(meeting.id, { studentId, status }), "Attendance updated.")}
            onScore={(slotId, score, feedback) => updateMeeting(() => scoreMeetingSlot(meeting.id, slotId, { score, feedback }), "Score saved.")}
            onAgendaDownload={() => runDownload(() => downloadAgenda(meeting.id))}
            onToggleLock={() => updateMeeting(() => toggleMeetingLock(meeting.id), meeting.isRoleLocked ? "Roles reopened." : "Roles locked.")}
          />
        ))}
      </div>
      {canManageMeetings && overview?.students.length ? (
        <RequirementManagementPanel
          students={overview.students}
          onUpdated={() => refreshMeetings()}
        />
      ) : null}
    </section>
  );
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

  async function handleRequirementUpdate(requirementId: string, currentCount: number, isCompleted: boolean) {
    if (!selectedStudentId) {
      return;
    }

    setError("");
    setStatus("");

    try {
      await updateStudentRequirement(selectedStudentId, requirementId, { currentCount, isCompleted });
      const updatedProgress = await fetchStudentProgressForManager(selectedStudentId);
      setProgress(updatedProgress);
      setStatus("Requirement progress updated.");
      onUpdated();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update requirement.");
    }
  }

  return (
    <section className="requirement-manager" id="requirements">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">PTB requirements</p>
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
        <ul className="requirement-list manager">
          {progress.requirements.map((entry) => (
            <li key={entry.requirement.id} className={entry.isCompleted ? "is-complete" : ""}>
              <div>
                <strong>{entry.requirement.bandLevel}: {entry.requirement.name}</strong>
                <span>{entry.requirement.description}</span>
              </div>
              <div className="requirement-controls">
                <input
                  key={`${entry.requirement.id}-${entry.currentCount}-${entry.isCompleted}`}
                  type="number"
                  min="0"
                  max={entry.requirement.targetCount}
                  defaultValue={entry.currentCount}
                  onBlur={(event) => handleRequirementUpdate(entry.requirement.id, Number(event.currentTarget.value), Number(event.currentTarget.value) >= entry.requirement.targetCount)}
                />
                <button type="button" onClick={() => handleRequirementUpdate(entry.requirement.id, entry.requirement.targetCount, true)}>Complete</button>
              </div>
            </li>
          ))}
        </ul>
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

function MeetingCard({
  meeting,
  students,
  user,
  isSubmitting,
  onClaim,
  onAssign,
  onAttendance,
  onScore,
  onAgendaDownload,
  onToggleLock
}: {
  meeting: Meeting;
  students: MeetingsOverview["students"];
  user: PortalUser;
  isSubmitting: boolean;
  onClaim: (slotId: string) => void;
  onAssign: (slotId: string, studentId: string | null) => void;
  onAttendance: (studentId: string, status: MeetingAttendance["status"]) => void;
  onScore: (slotId: string, score: number, feedback?: string) => void;
  onAgendaDownload: () => void;
  onToggleLock: () => void;
}) {
  const canManage = user.role === "ADMIN" || user.role === "FACILITATOR";
  const canClaim = user.role === "STUDENT" && !meeting.isRoleLocked;
  const openRoleCount = meeting.roleSlots.filter((slot) => !slot.assignedStudentId).length;

  return (
    <article className="meeting-card">
      <div className="meeting-card-header">
        <div>
          <span>{meeting.templateType}</span>
          <h3>{meeting.title}</h3>
          <p>{meeting.club.name} - {formatDate(meeting.meetingDate)} - {meeting.startTime}{meeting.location ? ` - ${meeting.location}` : ""}</p>
          {user.role === "STUDENT" ? <p className="open-role-summary">{openRoleCount} open role{openRoleCount === 1 ? "" : "s"} available to claim</p> : null}
        </div>
        <div className="meeting-actions">
          <strong className={meeting.isRoleLocked ? "lock-pill locked" : "lock-pill"}>{meeting.isRoleLocked ? "Locked" : "Open"}</strong>
          <button className="agenda-download" type="button" onClick={onAgendaDownload} disabled={isSubmitting}>Download Agenda</button>
          {canManage ? <button type="button" onClick={onToggleLock} disabled={isSubmitting}>{meeting.isRoleLocked ? "Reopen Roles" : "Lock Roles"}</button> : null}
        </div>
      </div>
      <div className="role-slot-grid">
        {meeting.roleSlots.map((slot) => {
          const assignedName = slot.assignedStudent ? `${slot.assignedStudent.user.firstName} ${slot.assignedStudent.user.lastName}` : "Open";

          return (
            <div className={slot.assignedStudentId ? "role-slot" : "role-slot is-open"} key={slot.id}>
              <div>
                <strong>{slot.roleDefinition.name}</strong>
                <span>{assignedName}</span>
              </div>
              {canClaim && !slot.assignedStudentId ? (
                <button type="button" onClick={() => onClaim(slot.id)} disabled={isSubmitting}>Claim Role</button>
              ) : null}
              {canManage ? (
                <RoleManagementControls
                  slot={slot}
                  students={students}
                  isSubmitting={isSubmitting}
                  onAssign={(studentId) => onAssign(slot.id, studentId)}
                  onScore={(score, feedback) => onScore(slot.id, score, feedback)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {canManage ? (
        <div className="attendance-panel">
          <h4>Attendance</h4>
          <div className="attendance-grid">
            {students.map((student) => {
              const attendance = meeting.attendance.find((entry) => entry.studentId === student.id);

              return (
                <label key={student.id}>
                  <span>{student.user.firstName} {student.user.lastName}</span>
                  <select
                    value={attendance?.status ?? ""}
                    onChange={(event) => onAttendance(student.id, event.target.value as MeetingAttendance["status"])}
                    disabled={isSubmitting}
                  >
                    <option value="">Not marked</option>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="LATE">Late</option>
                    <option value="EXCUSED">Excused</option>
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function RoleManagementControls({
  slot,
  students,
  isSubmitting,
  onAssign,
  onScore
}: {
  slot: Meeting["roleSlots"][number];
  students: MeetingsOverview["students"];
  isSubmitting: boolean;
  onAssign: (studentId: string | null) => void;
  onScore: (score: number, feedback?: string) => void;
}) {
  const [score, setScore] = useState(String(slot.score?.score ?? ""));
  const [feedback, setFeedback] = useState(slot.score?.feedback ?? "");

  useEffect(() => {
    setScore(String(slot.score?.score ?? ""));
    setFeedback(slot.score?.feedback ?? "");
  }, [slot.id, slot.assignedStudentId, slot.score?.score, slot.score?.feedback]);

  function handleSaveScore() {
    if (!score) {
      return;
    }

    onScore(Number(score), feedback);
  }

  return (
    <div className="role-management-controls">
      <select value={slot.assignedStudentId ?? ""} onChange={(event) => onAssign(event.target.value || null)} disabled={isSubmitting}>
        <option value="">Open</option>
        {students.map((student) => (
          <option key={student.id} value={student.id}>{student.user.firstName} {student.user.lastName}</option>
        ))}
      </select>
      <label>
        Score
        <input
          type="number"
          min="0"
          max="100"
          value={score}
          placeholder="0-100"
          disabled={isSubmitting || !slot.assignedStudentId}
          onChange={(event) => setScore(event.currentTarget.value)}
        />
      </label>
      <label className="feedback-input">
        Feedback
        <input
          value={feedback}
          placeholder="Comment"
          disabled={isSubmitting || !slot.assignedStudentId}
          onChange={(event) => setFeedback(event.currentTarget.value)}
        />
      </label>
      <button type="button" onClick={handleSaveScore} disabled={isSubmitting || !slot.assignedStudentId || !score}>Save</button>
    </div>
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
            <SummaryTile label="Band Level" valueText={progress.summary.bandLevel} />
            <SummaryTile label="Attendance" valueText={progress.summary.attendanceRate === null ? "N/A" : `${progress.summary.attendanceRate}%`} />
            <SummaryTile label="Roles Completed" value={progress.summary.rolesCompleted} />
            <SummaryTile label="Average Score" valueText={progress.summary.averageScore === null ? "N/A" : `${progress.summary.averageScore}`} />
          </div>

          <div className="student-context-card">
            <strong>{progress.summary.clubName}</strong>
            <span>{progress.summary.centreName}</span>
          </div>

          <DataPanel title="Band/PTB Requirements">
            {progress.requirements.length ? (
              <ul className="requirement-list">
                {progress.requirements.map((entry) => (
                  <li key={entry.requirement.id} className={entry.isCompleted ? "is-complete" : ""}>
                    <div>
                      <strong>{entry.requirement.bandLevel}: {entry.requirement.name}</strong>
                      <span>{entry.requirement.description}</span>
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
