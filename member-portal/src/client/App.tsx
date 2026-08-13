import { FormEvent, useEffect, useMemo, useState } from "react";
import ileapClubLogoUrl from "../../../assets/images/ileap-club-logo.jpg";
import {
  changeMyPassword,
  clearToken,
  getCurrentUser,
  getMeetingsOverview,
  getStoredToken,
  getStudentProgress,
  login,
  Meeting,
  PortalUser,
  Role,
  storeToken,
  StudentProgress
} from "./api";
import { AdminWorkspace } from "./components/AdminWorkspace";
import { DocumentsWorkspace } from "./components/DocumentsWorkspace";
import { FeedbackReportPanel } from "./components/FeedbackReportPanel";
import { MeetingWorkspace } from "./components/MeetingWorkspace";
import { MembersWorkspace } from "./components/MembersWorkspace";
import { StudentClubMembersPanel, StudentProgressDashboard } from "./components/StudentProgressPanels";
import { formatDate, formatProgramLevel, getNextBandLevel, isTodayOrFuture, roleSlotName } from "./components/portalShared";

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
  const [isPasswordPanelOpen, setIsPasswordPanelOpen] = useState(false);

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
          <button type="button" onClick={() => setIsPasswordPanelOpen((isOpen) => !isOpen)}>
            {isPasswordPanelOpen ? "Close" : "Change Password"}
          </button>
          <button type="button" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      {isPasswordPanelOpen ? <ChangePasswordPanel /> : null}

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

      {user.role === "STUDENT" ? <StudentHomeSummary user={user} /> : null}

      {user.role !== "STUDENT" ? (
        <section className="dashboard-grid">
          <PortalCard title="Primary Actions" items={copy.actions} />
          <PortalCard title="Important Reports" items={copy.reports} />
        </section>
      ) : null}

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

function StudentHomeSummary({ user }: { user: PortalUser }) {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStudentProgress(), getMeetingsOverview()])
      .then(([progressResult, meetingsResult]) => {
        setProgress(progressResult);
        setMeetings(meetingsResult.meetings);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load your dashboard summary."))
      .finally(() => setIsLoading(false));
  }, []);

  const upcomingMeetings = meetings
    .filter((meeting) => isTodayOrFuture(meeting.meetingDate))
    .sort((first, second) => new Date(first.meetingDate).getTime() - new Date(second.meetingDate).getTime());
  const nextMeeting = upcomingMeetings[0] ?? null;
  const bookedSlots = upcomingMeetings.flatMap((meeting) =>
    meeting.roleSlots
      .filter((slot) => slot.assignedStudent?.user.id === user.id)
      .map((slot) => ({ meeting, slot }))
  );
  const currentBand = progress?.summary.bandLevel ?? "Not set";
  const nextBand = getNextBandLevel(currentBand);
  const currentBandRequirements = progress?.requirements.filter((entry) => entry.requirement.bandLevel === currentBand) ?? [];
  const completedCurrentBandRequirements = currentBandRequirements.filter((entry) => entry.isCompleted).length;
  const progressText = currentBandRequirements.length
    ? `${completedCurrentBandRequirements}/${currentBandRequirements.length} requirements`
    : "No requirements yet";

  return (
    <section className="student-home-summary" aria-label="Student home summary">
      <div className="student-home-summary-header">
        <div>
          <p className="eyebrow">My snapshot</p>
          <h3>What matters now</h3>
        </div>
        {isLoading ? <span>Loading...</span> : null}
      </div>

      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <div className="student-home-grid">
        <article>
          <span>Current Band</span>
          <strong>{currentBand}</strong>
          <small>{nextBand ? `Next band: ${nextBand}` : formatProgramLevel(progress?.summary.programLevel)}</small>
        </article>
        <article>
          <span>Progress Toward Next Band</span>
          <strong>{progressText}</strong>
          <small>{currentBandRequirements.length ? "Current band requirements" : "Ask your facilitator for setup"}</small>
        </article>
        <article>
          <span>Next Meeting</span>
          <strong>{nextMeeting ? nextMeeting.title : "No upcoming meeting"}</strong>
          <small>{nextMeeting ? `${formatDate(nextMeeting.meetingDate)}${nextMeeting.startTime ? ` at ${nextMeeting.startTime}` : ""}` : "Check back soon"}</small>
        </article>
        <article>
          <span>Booked Roles</span>
          <strong>{bookedSlots.length ? `${bookedSlots.length} booked` : "None booked"}</strong>
          <small>{bookedSlots[0] ? `${roleSlotName(bookedSlots[0].slot)} - ${bookedSlots[0].meeting.title}` : "Open Meetings to choose roles"}</small>
        </article>
      </div>

      <nav className="student-quick-links" aria-label="Student quick links">
        <a href="#meetings">Meetings</a>
        <a href="#resources">Resources</a>
        <a href="#progress">Band Progress</a>
        <a href="#club-members">My Club</a>
      </nav>
    </section>
  );
}

function ChangePasswordPanel() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    setStatus("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await changeMyPassword({ currentPassword, newPassword });
      form.reset();
      setStatus("Password changed.");
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Unable to change password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="password-panel" aria-label="Change password">
      <form className="edit-user-panel" onSubmit={handleSubmit}>
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Account</p>
            <h3>Change Password</h3>
          </div>
        </div>
        {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
        {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
        <div className="form-two-column">
          <label>Current Password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label>New Password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm New Password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
        </div>
        <div className="edit-user-actions">
          <button type="submit" disabled={isSubmitting}>Save Password</button>
        </div>
      </form>
    </section>
  );
}


