import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AdminOverview,
  clearToken,
  createCentre,
  createClub,
  createUser,
  getAdminOverview,
  getCurrentUser,
  getStoredToken,
  login,
  PortalUser,
  Role,
  storeToken
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

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <article className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
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
