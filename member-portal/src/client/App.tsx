import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AdminOverview,
  agendaDownloadUrl,
  assignMeetingSlot,
  claimMeetingSlot,
  clearToken,
  createCentre,
  createClub,
  createMeeting,
  createUser,
  fetchStudentProgressForManager,
  getAdminOverview,
  getCurrentUser,
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
  storeToken,
  StudentProgress,
  toggleMeetingLock,
  updateStudentRequirement
} from "./api";

const roleCopy: Record<Role, { title: string; summary: string; actions: string[]; reports: string[] }> = {
  ADMIN: {
    title: "Operations Control",
    summary: "Manage centres, clubs, members, facilitators, and portal configuration.",
    actions: ["Create centres and clubs", "Invite facilitators and families", "Review enrollment and activity"],
    reports: ["Centre growth", "Club roster health", "Attendance and band progress"]
  },
  FACILITATOR: {
    title: "Club Meeting Workspace",
    summary: "Prepare meetings, manage role claims, override assignments, and track performance.",
    actions: ["Create upcoming meetings", "Lock or reopen roles", "Record attendance and scores"],
    reports: ["Meeting readiness", "Role participation", "Student progress"]
  },
  PARENT: {
    title: "Family Progress View",
    summary: "View each child, upcoming meetings, role assignments, attendance, and skill progress.",
    actions: ["Review upcoming roles", "Track child progress", "Contact the facilitator"],
    reports: ["Attendance history", "Band progress", "Recent feedback"]
  },
  STUDENT: {
    title: "Student Dashboard",
    summary: "Claim open roles, prepare for upcoming meetings, and follow personal progress.",
    actions: ["Claim at least two open roles", "Download meeting agenda", "Review scores and feedback"],
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
  const [email, setEmail] = useState("admin@ileapclub.com");
  const [password, setPassword] = useState("ChangeMe123!");
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
          <span>iLEAP Club</span>
          <h1>Member Portal</h1>
          <p>Sign in to manage clubs, meetings, role assignments, attendance, and student progress.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
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
          <p className="login-note">Seed account for local testing: admin@ileapclub.com / ChangeMe123!</p>
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
      <header className="portal-header">
        <div>
          <p>iLEAP Club Member Portal</p>
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
          <span>Foundation</span>
          <strong>Phase 2A</strong>
          <p>Authentication and role-aware portal shell are ready for the next build slice.</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <PortalCard title="Primary Actions" items={copy.actions} />
        <PortalCard title="Important Reports" items={copy.reports} />
        <PortalCard title="Next Modules To Build" items={upcomingWork} />
      </section>

      {user.role === "ADMIN" ? <AdminWorkspace /> : null}
      <MeetingWorkspace user={user} />
      {user.role === "STUDENT" ? <StudentProgressDashboard /> : null}
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
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await action(event.currentTarget);
      event.currentTarget.reset();
      setNewUserRole("STUDENT");
      await refreshOverview();
      setStatus(successMessage);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save changes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const parents = overview?.users.filter((portalUser) => portalUser.role === "PARENT") ?? [];
  const clubs = overview?.clubs ?? [];

  return (
    <section className="admin-workspace" aria-label="Admin setup workspace">
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
              {overview?.centres.map((centre) => (
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
                const parentSelect = form.elements.namedItem("parentIds") as HTMLSelectElement | null;
                const facilitatorClubSelect = form.elements.namedItem("facilitatorClubIds") as HTMLSelectElement | null;
                await createUser({
                  firstName: String(formData.get("firstName") || ""),
                  lastName: String(formData.get("lastName") || ""),
                  email: String(formData.get("email") || ""),
                  password: String(formData.get("password") || ""),
                  role: String(formData.get("role") || "STUDENT") as Role,
                  grade: String(formData.get("grade") || ""),
                  clubId: String(formData.get("clubId") || ""),
                  parentIds: parentSelect ? Array.from(parentSelect.selectedOptions).map((option) => option.value) : [],
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
                <option value="PARENT">Parent</option>
                <option value="FACILITATOR">Facilitator</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            {newUserRole === "STUDENT" ? (
              <>
                <label>Grade<input name="grade" placeholder="Grade 6" /></label>
                <label>
                  Club
                  <select name="clubId">
                    <option value="">No club yet</option>
                    {clubs.map((club) => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Parents
                  <select name="parentIds" multiple>
                    {parents.map((parent) => (
                      <option key={parent.id} value={parent.id}>{parent.firstName} {parent.lastName}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {newUserRole === "FACILITATOR" ? (
              <label>
                Facilitator Clubs
                <select name="facilitatorClubIds" multiple>
                  {clubs.map((club) => (
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
                <li key={centre.id}><strong>{centre.name}</strong><span>{centre.city}, {centre.province} · {centre.clubs?.length ?? 0} clubs</span></li>
              ))}
            </ul>
          ) : <p>No centres yet.</p>}
        </DataPanel>

        <DataPanel title="Clubs">
          {overview?.clubs.length ? (
            <ul className="record-list">
              {overview.clubs.map((club) => (
                <li key={club.id}><strong>{club.name}</strong><span>{club.program} · {club.students?.length ?? 0} students · {club.facilitators?.length ?? 0} facilitators</span></li>
              ))}
            </ul>
          ) : <p>No clubs yet.</p>}
        </DataPanel>

        <DataPanel title="Users">
          {overview?.users.length ? (
            <ul className="record-list">
              {overview.users.map((portalUser) => (
                <li key={portalUser.id}><strong>{portalUser.firstName} {portalUser.lastName}</strong><span>{formatRole(portalUser.role)} · {portalUser.email}</span></li>
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
                  <span>{student.grade} · {student.club?.name ?? "No club"} · parents: {student.parents?.map((parent) => `${parent.parent.firstName} ${parent.parent.lastName}`).join(", ") || "None"}</span>
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
      const roleSelect = form.elements.namedItem("roleDefinitionIds") as HTMLSelectElement;
      await createMeeting({
        clubId: String(formData.get("clubId") || ""),
        title: String(formData.get("title") || ""),
        templateType: String(formData.get("templateType") || ""),
        meetingDate: String(formData.get("meetingDate") || ""),
        startTime: String(formData.get("startTime") || ""),
        location: String(formData.get("location") || ""),
        roleDefinitionIds: Array.from(roleSelect.selectedOptions).map((option) => option.value)
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
      setStatus(successMessage);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update meeting.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="meeting-workspace" aria-label="Meeting and role workspace">
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
            <label className="wide-field">
              Role Slots
              <select name="roleDefinitionIds" multiple required>
                {overview?.roleDefinitions.map((roleDefinition) => (
                  <option key={roleDefinition.id} value={roleDefinition.id}>{roleDefinition.name}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={isSubmitting || !overview?.clubs.length}>Create Meeting</button>
        </form>
      ) : null}

      <div className="meeting-list">
        {isLoading ? <p>Loading meetings...</p> : null}
        {!isLoading && !overview?.meetings.length ? <p>No meetings yet.</p> : null}
        {overview?.meetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            students={overview.students.filter((student) => student.clubId === meeting.clubId)}
            user={user}
            isSubmitting={isSubmitting}
            onClaim={(slotId) => updateMeeting(() => claimMeetingSlot(meeting.id, slotId), "Role claimed.")}
            onAssign={(slotId, studentId) => updateMeeting(() => assignMeetingSlot(meeting.id, slotId, studentId), "Role assignment updated.")}
            onAttendance={(studentId, status) => updateMeeting(() => markMeetingAttendance(meeting.id, { studentId, status }), "Attendance updated.")}
            onScore={(slotId, score) => updateMeeting(() => scoreMeetingSlot(meeting.id, slotId, { score }), "Score saved.")}
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
    <section className="requirement-manager">
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

function MeetingCard({
  meeting,
  students,
  user,
  isSubmitting,
  onClaim,
  onAssign,
  onAttendance,
  onScore,
  onToggleLock
}: {
  meeting: Meeting;
  students: MeetingsOverview["students"];
  user: PortalUser;
  isSubmitting: boolean;
  onClaim: (slotId: string) => void;
  onAssign: (slotId: string, studentId: string | null) => void;
  onAttendance: (studentId: string, status: MeetingAttendance["status"]) => void;
  onScore: (slotId: string, score: number) => void;
  onToggleLock: () => void;
}) {
  const canManage = user.role === "ADMIN" || user.role === "FACILITATOR";
  const canClaim = user.role === "STUDENT" && !meeting.isRoleLocked;

  return (
    <article className="meeting-card">
      <div className="meeting-card-header">
        <div>
          <span>{meeting.templateType}</span>
          <h3>{meeting.title}</h3>
          <p>{meeting.club.name} · {formatDate(meeting.meetingDate)} · {meeting.startTime}{meeting.location ? ` · ${meeting.location}` : ""}</p>
        </div>
        <div className="meeting-actions">
          <strong className={meeting.isRoleLocked ? "lock-pill locked" : "lock-pill"}>{meeting.isRoleLocked ? "Locked" : "Open"}</strong>
          <a className="agenda-download" href={agendaDownloadUrl(meeting.id)}>Download Agenda</a>
          {canManage ? <button type="button" onClick={onToggleLock} disabled={isSubmitting}>{meeting.isRoleLocked ? "Reopen Roles" : "Lock Roles"}</button> : null}
        </div>
      </div>
      <div className="role-slot-grid">
        {meeting.roleSlots.map((slot) => {
          const assignedName = slot.assignedStudent ? `${slot.assignedStudent.user.firstName} ${slot.assignedStudent.user.lastName}` : "Open";

          return (
            <div className="role-slot" key={slot.id}>
              <div>
                <strong>{slot.roleDefinition.name}</strong>
                <span>{assignedName}</span>
              </div>
              {canClaim && !slot.assignedStudentId ? (
                <button type="button" onClick={() => onClaim(slot.id)} disabled={isSubmitting}>Claim</button>
              ) : null}
              {canManage ? (
                <div className="role-management-controls">
                  <select value={slot.assignedStudentId ?? ""} onChange={(event) => onAssign(slot.id, event.target.value || null)} disabled={isSubmitting}>
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
                      defaultValue={slot.score?.score ?? ""}
                      placeholder="0-100"
                      disabled={isSubmitting || !slot.assignedStudentId}
                      onBlur={(event) => {
                        if (event.currentTarget.value) {
                          onScore(slot.id, Number(event.currentTarget.value));
                        }
                      }}
                    />
                  </label>
                </div>
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
    <section className="student-progress" aria-label="Student progress dashboard">
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
                      <span>{slot.meeting.title} · {formatDate(slot.meeting.meetingDate)} · score: {slot.score?.score ?? "Not scored"}</span>
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
                      <span>{score.meeting.title} · {score.feedback || "No feedback entered yet."}</span>
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
                      <span>{attendance.meeting.title} · {formatDate(attendance.meeting.meetingDate)}</span>
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

function formatRole(role: Role) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
