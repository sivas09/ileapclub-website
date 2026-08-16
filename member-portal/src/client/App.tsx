import { FormEvent, useEffect, useMemo, useState } from "react";
import ileapClubLogoUrl from "../../../assets/images/ileap-club-logo.jpg";
import {
  changeMyPassword,
  clearToken,
  getCurrentUser,
  getStoredToken,
  getStudentProgress,
  login,
  onAuthenticationExpired,
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
import { NoticesWorkspace } from "./components/NoticesWorkspace";
import { WorkspaceErrorBoundary } from "./components/PortalErrorBoundary";
import { StudentClubMembersPanel, StudentProgressDashboard } from "./components/StudentProgressPanels";
import {
  formatProgramLevel,
  formatRole,
  overviewLinksForRole,
  portalNavigationItems,
  sectionHrefForHash
} from "./components/portalShared";

const roleCopy: Record<Role, { title: string; summary: string }> = {
  ADMIN: {
    title: "Admin Overview",
    summary: "Choose a section to manage club operations and member progress."
  },
  FACILITATOR: {
    title: "Facilitator Overview",
    summary: "Choose a section to prepare meetings and support your assigned members."
  },
  STUDENT: {
    title: "My Overview",
    summary: "See your current level, then open the section you need."
  }
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

  useEffect(() => onAuthenticationExpired(() => {
    setUser(null);
    setIsLoading(false);
    setError("Your session expired. Please sign in again.");
  }), []);

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
  const [activeHash, setActiveHash] = useState(() => window.location.hash);
  const activeHref = sectionHrefForHash(user.role, activeHash);
  const activeTitle = portalNavigationItems[user.role].find((item) => item.href === activeHref)?.label ?? "Overview";

  useEffect(() => {
    function syncPortalSection() {
      setActiveHash(window.location.hash);
    }

    window.addEventListener("hashchange", syncPortalSection);
    return () => window.removeEventListener("hashchange", syncPortalSection);
  }, []);

  useEffect(() => {
    const hashRoot = window.location.hash.split("/")[0];
    const targetId = hashRoot === "#resource-links" || (hashRoot === "#resources" && user.role !== "STUDENT")
      ? "resource-links"
      : hashRoot?.replace(/^#/, "");
    if (!targetId || activeHref === "#overview") {
      window.scrollTo({ top: 0 });
      return;
    }

    window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView());
  }, [activeHash, activeHref, user.role]);

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
          {portalNavigationItems[user.role].map((item) => (
            <a
              href={item.href}
              key={item.href}
              className={item.href === activeHref ? "is-active" : undefined}
              aria-current={item.href === activeHref ? "page" : undefined}
            >
              {item.label}
            </a>
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
          <h1>{activeHref === "#overview" ? copy.title : activeTitle}</h1>
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

      {activeHref === "#overview" ? (
        <>
          <section className="overview-intro" aria-labelledby="overview-title">
            <p className="eyebrow">{formatRole(user.role)}</p>
            <h2 id="overview-title">Welcome back, {user.firstName}.</h2>
            <p>{copy.summary}</p>
            {user.role === "ADMIN" ? <small>To preview member experience, use a student test account.</small> : null}
          </section>

          {user.role === "STUDENT" ? (
            <WorkspaceErrorBoundary workspace="your dashboard summary" anchorId="student-summary-error" compact>
              <StudentHomeSummary user={user} />
            </WorkspaceErrorBoundary>
          ) : null}

          <OverviewLaunchGrid role={user.role} />
        </>
      ) : <ActiveWorkspace activeHref={activeHref} user={user} />}
      </div>
    </main>
  );
}

function ActiveWorkspace({ activeHref, user }: { activeHref: string; user: PortalUser }) {
  if (activeHref === "#admin" && user.role === "ADMIN") {
    return <WorkspaceErrorBoundary workspace="Centres and Clubs" anchorId="admin"><AdminWorkspace currentUser={user} /></WorkspaceErrorBoundary>;
  }

  if (activeHref === "#members" && user.role !== "STUDENT") {
    return <WorkspaceErrorBoundary workspace="Members" anchorId="members"><MembersWorkspace user={user} /></WorkspaceErrorBoundary>;
  }

  if (activeHref === "#notices") {
    return <WorkspaceErrorBoundary workspace="Notices" anchorId="notices"><NoticesWorkspace user={user} /></WorkspaceErrorBoundary>;
  }

  if (activeHref === "#documents" || activeHref === "#resources") {
    const workspaceName = user.role === "STUDENT" ? "Resources" : "Documents";
    return <WorkspaceErrorBoundary workspace={workspaceName} anchorId={activeHref.slice(1)}><DocumentsWorkspace user={user} /></WorkspaceErrorBoundary>;
  }

  if (activeHref === "#meetings" || activeHref === "#requirements") {
    const workspaceName = activeHref === "#requirements" ? "Band Progress" : "Meetings";
    return <WorkspaceErrorBoundary workspace={workspaceName} anchorId={activeHref.slice(1)}><MeetingWorkspace user={user} /></WorkspaceErrorBoundary>;
  }

  if (activeHref === "#feedback" && user.role !== "STUDENT") {
    return <WorkspaceErrorBoundary workspace="Feedback" anchorId="feedback"><FeedbackReportPanel /></WorkspaceErrorBoundary>;
  }

  if (activeHref === "#club-members" && user.role === "STUDENT") {
    return <WorkspaceErrorBoundary workspace="My Club" anchorId="club-members"><StudentClubMembersPanel /></WorkspaceErrorBoundary>;
  }

  if (activeHref === "#progress" && user.role === "STUDENT") {
    return <WorkspaceErrorBoundary workspace="My Progress" anchorId="progress"><StudentProgressDashboard /></WorkspaceErrorBoundary>;
  }

  return null;
}

function OverviewLaunchGrid({ role }: { role: Role }) {
  return (
    <nav className="overview-launch-grid" aria-label="Portal sections">
      {overviewLinksForRole(role).map((item) => (
        <a href={item.href} key={item.href}>
          <strong>{item.label}</strong>
          <span>{item.description}</span>
          <small>Open</small>
        </a>
      ))}
    </nav>
  );
}

function StudentHomeSummary({ user }: { user: PortalUser }) {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getStudentProgress()
      .then(setProgress)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load your dashboard summary."))
      .finally(() => setIsLoading(false));
  }, []);

  const currentBand = progress?.summary.bandLevel ?? "Not set";
  const nextRequirement = progress?.requirements
    .filter((entry) => !entry.isCompleted)
    .sort((left, right) => {
      const leftIsCurrentBand = left.requirement.bandLevel === currentBand ? 0 : 1;
      const rightIsCurrentBand = right.requirement.bandLevel === currentBand ? 0 : 1;
      return leftIsCurrentBand - rightIsCurrentBand
        || left.requirement.bandOrder - right.requirement.bandOrder
        || left.requirement.sortOrder - right.requirement.sortOrder;
    })[0];
  const studentName = `${user.firstName} ${user.lastName}`;

  return (
    <section className="student-home-summary" aria-labelledby="student-summary-title">
      <div className="student-home-summary-header">
        <div>
          <p className="eyebrow">Member summary</p>
          <h3 id="student-summary-title">{studentName}</h3>
        </div>
        {isLoading ? <span>Loading...</span> : null}
      </div>

      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <div className="student-home-grid">
        <article className="student-band-highlight">
          <span>Current Band</span>
          <strong>{currentBand}</strong>
        </article>
        <article>
          <span>Club</span>
          <strong>{progress?.summary.clubName || "Not assigned"}</strong>
        </article>
        <article>
          <span>Program Level</span>
          <strong>{formatProgramLevel(progress?.summary.programLevel)}</strong>
        </article>
        <article>
          <span>Next Requirement</span>
          <strong>{nextRequirement?.requirement.name || "No pending requirement"}</strong>
          {nextRequirement ? <small>{nextRequirement.requirement.bandLevel}</small> : null}
        </article>
      </div>
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


