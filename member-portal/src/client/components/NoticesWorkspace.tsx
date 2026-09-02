import { FormEvent, useEffect, useState } from "react";
import {
  Club,
  createNotice,
  deleteNotice,
  getNotices,
  Notice,
  PortalUser,
  updateNotice
} from "../api";
import { noticeLimits, noticeStatuses } from "../../shared/portalConstants";
import { formatDate, isOperationalManagerRole } from "./portalShared";

type NoticeFilters = {
  clubId: string;
  status: string;
};

export function NoticesWorkspace({ user }: { user: PortalUser }) {
  return user.role === "STUDENT" ? <StudentNoticesPanel /> : <ManagerNoticesPanel user={user} />;
}

function ManagerNoticesPanel({ user }: { user: PortalUser }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [filters, setFilters] = useState<NoticeFilters>({ clubId: "", status: "ACTIVE" });
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshNotices(nextFilters = filters) {
    const result = await getNotices(nextFilters);
    setNotices(result.notices);
    setClubs(result.clubs);
  }

  useEffect(() => {
    refreshNotices()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load notices."))
      .finally(() => setIsLoading(false));
  }, []);

  function updateFilter(key: keyof NoticeFilters, value: string) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setError("");
    refreshNotices(nextFilters).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to filter notices."));
  }

  function clearFilters() {
    const nextFilters = { clubId: "", status: "" };
    setFilters(nextFilters);
    setError("");
    refreshNotices(nextFilters).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to clear notice filters."));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setIsSubmitting(true);
    setError("");
    setStatusMessage("");

    try {
      await createNotice(noticePayload(formData));
      form.reset();
      await refreshNotices();
      setIsAddFormOpen(false);
      setStatusMessage("Notice posted.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create notice.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSave(noticeId: string, formData: FormData) {
    setIsSubmitting(true);
    setError("");
    setStatusMessage("");

    try {
      await updateNotice(noticeId, noticePayload(formData));
      await refreshNotices();
      setEditingNotice(null);
      setStatusMessage("Notice updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update notice.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(notice: Notice) {
    setIsSubmitting(true);
    setError("");
    setStatusMessage("");

    try {
      const nextStatus = notice.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
      await updateNotice(notice.id, { status: nextStatus });
      await refreshNotices();
      setStatusMessage(nextStatus === "ACTIVE" ? "Notice activated." : "Notice archived.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to change notice status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(notice: Notice) {
    if (!window.confirm(`Permanently delete notice "${notice.title}"? This action cannot be undone.`)) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatusMessage("");

    try {
      await deleteNotice(notice.id);
      await refreshNotices();
      setEditingNotice((current) => current?.id === notice.id ? null : current);
      setStatusMessage("Notice permanently deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete notice.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="notices-workspace" id="notices" aria-label="Notices management">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Club communication</p>
          <h2>Notices</h2>
        </div>
        <button type="button" onClick={() => refreshNotices()} disabled={isLoading}>Refresh</button>
      </div>

      {statusMessage ? <p className="admin-status is-success" role="status">{statusMessage}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      <form className="document-filter-form notice-filter-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Club
          <select value={filters.clubId} onChange={(event) => updateFilter("clubId", event.currentTarget.value)}>
            <option value="">All visible clubs</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => updateFilter("status", event.currentTarget.value)}>
            {noticeStatuses.map((status) => <option key={status} value={status}>{formatNoticeStatus(status)}</option>)}
            <option value="">All statuses</option>
          </select>
        </label>
      </form>

      <div className="document-list-toolbar">
        <p aria-live="polite"><strong>{notices.length}</strong> {notices.length === 1 ? "notice" : "notices"} found</p>
        <button type="button" className="document-clear-filters" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="document-add-toggle">
        <button type="button" onClick={() => setIsAddFormOpen((isOpen) => !isOpen)}>
          {isAddFormOpen ? "Cancel New Notice" : "Add New Notice"}
        </button>
      </div>

      {isAddFormOpen ? (
        <form className="document-form notice-form" onSubmit={handleCreate}>
          <h3>Add New Notice</h3>
          <NoticeFields clubs={clubs} allowAllClubs={isOperationalManagerRole(user.role)} />
          <button type="submit" disabled={isSubmitting}>Post Notice</button>
        </form>
      ) : null}

      {isLoading ? <p className="loading-state">Loading notices...</p> : null}
      {!isLoading && !notices.length ? <p className="loading-state notice-empty-state">No notices match the selected filters.</p> : null}

      {!isLoading && notices.length ? (
        <div className="document-list-wrap notice-list-wrap">
          <table className="document-list-table notice-management-table">
            <caption className="sr-only">Notices and management actions</caption>
            <thead>
              <tr>
                <th scope="col">Notice</th>
                <th scope="col">Club</th>
                <th scope="col">Status</th>
                <th scope="col">Posted By</th>
                <th scope="col">Posted</th>
                <th scope="col">Expires</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((notice) => (
                <ManagerNoticeRow
                  key={notice.id}
                  notice={notice}
                  clubs={clubs}
                  allowAllClubs={isOperationalManagerRole(user.role)}
                  canEdit={isOperationalManagerRole(user.role) || Boolean(notice.clubId)}
                  canDelete={isOperationalManagerRole(user.role)}
                  isEditing={editingNotice?.id === notice.id}
                  isSubmitting={isSubmitting}
                  onEdit={() => setEditingNotice(notice)}
                  onCancel={() => setEditingNotice(null)}
                  onSave={handleSave}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ManagerNoticeRow({
  notice,
  clubs,
  allowAllClubs,
  canEdit,
  canDelete,
  isEditing,
  isSubmitting,
  onEdit,
  onCancel,
  onSave,
  onStatusChange,
  onDelete
}: {
  notice: Notice;
  clubs: Club[];
  allowAllClubs: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (noticeId: string, formData: FormData) => void;
  onStatusChange: (notice: Notice) => void;
  onDelete: (notice: Notice) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(notice.id, new FormData(event.currentTarget));
  }

  const statusLabel = formatNoticeStatus(notice.status);

  return (
    <>
      <tr className={notice.status === "ARCHIVED" ? "is-archived" : ""}>
        <td className="notice-title-cell" data-label="Notice">
          <div className="notice-title-line">
            <strong title={notice.title}>{notice.title}</strong>
            {notice.isPinned ? <span className="notice-important-badge">Important</span> : null}
          </div>
          <small title={notice.message}>{notice.message}</small>
        </td>
        <td data-label="Club"><span className="document-badge secondary-badge">{notice.clubName}</span></td>
        <td data-label="Status">
          <span className={`document-badge status-badge ${notice.status === "ARCHIVED" ? "is-archived" : "is-active"}`}>{statusLabel}</span>
        </td>
        <td data-label="Posted By">{notice.createdBy}</td>
        <td data-label="Posted"><time dateTime={notice.createdAt}>{formatDate(notice.createdAt)}</time></td>
        <td data-label="Expires">{notice.expiresAt ? <time dateTime={notice.expiresAt}>{formatExpiryDate(notice.expiresAt)}</time> : "No expiry"}</td>
        <td className="document-row-actions" data-label="Actions">
          <div className="document-actions document-actions-compact">
            {canEdit ? <button type="button" aria-label={`Edit ${notice.title}`} onClick={onEdit}>Edit</button> : null}
            {canEdit ? (
              <button type="button" aria-label={`${notice.status === "ARCHIVED" ? "Activate" : "Archive"} ${notice.title}`} onClick={() => onStatusChange(notice)} disabled={isSubmitting}>
                {notice.status === "ARCHIVED" ? "Activate" : "Archive"}
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" className="danger-action" aria-label={`Delete ${notice.title}`} onClick={() => onDelete(notice)} disabled={isSubmitting}>Delete</button>
            ) : null}
          </div>
        </td>
      </tr>
      {isEditing ? (
        <tr className="document-edit-row notice-edit-row">
          <td colSpan={7}>
            <form className="document-edit-form notice-form" onSubmit={handleSubmit}>
              <NoticeFields notice={notice} clubs={clubs} allowAllClubs={allowAllClubs} />
              <div className="document-actions">
                <button type="submit" disabled={isSubmitting}>Save</button>
                <button type="button" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
              </div>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function NoticeFields({ notice, clubs, allowAllClubs }: { notice?: Notice; clubs: Club[]; allowAllClubs: boolean }) {
  return (
    <>
      <label>
        Title
        <input name="title" defaultValue={notice?.title ?? ""} maxLength={noticeLimits.title} required />
      </label>
      <label className="notice-message-field">
        Message
        <textarea name="message" defaultValue={notice?.message ?? ""} maxLength={noticeLimits.message} rows={4} required />
      </label>
      <label>
        Club
        <select name="clubId" defaultValue={notice?.clubId ?? ""} required={!allowAllClubs}>
          {allowAllClubs ? <option value="">All Clubs</option> : <option value="">Select a club</option>}
          {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
        </select>
      </label>
      <label>
        Show Until <span>Optional</span>
        <input name="expiresAt" type="date" defaultValue={expiryInputValue(notice?.expiresAt)} />
      </label>
      <label className="notice-checkbox">
        <input name="isPinned" type="checkbox" defaultChecked={notice?.isPinned ?? false} />
        <span>Pin as important notice</span>
      </label>
    </>
  );
}

function StudentNoticesPanel() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getNotices()
      .then((result) => setNotices(result.notices))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load notices."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section className="notices-workspace student-notices-workspace" id="notices" aria-label="Club notices">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Updates and reminders</p>
          <h2>Notices</h2>
        </div>
      </div>

      {isLoading ? <p className="loading-state">Loading notices...</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {!isLoading && !error && !notices.length ? <p className="notice-empty-state">No new notices.</p> : null}

      {notices.length ? (
        <div className="student-notice-list">
          {notices.map((notice) => (
            <article className={`student-notice-card ${notice.isPinned ? "is-important" : ""}`} key={notice.id}>
              <div className="student-notice-heading">
                <h3>{notice.title}</h3>
                {notice.isPinned ? <span className="notice-important-badge">Important</span> : null}
              </div>
              <p>{notice.message}</p>
              <div className="student-notice-meta">
                <span>{notice.clubName}</span>
                <time dateTime={notice.createdAt}>Posted {formatDate(notice.createdAt)}</time>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function noticePayload(formData: FormData) {
  return {
    title: String(formData.get("title") || ""),
    message: String(formData.get("message") || ""),
    clubId: String(formData.get("clubId") || "") || null,
    expiresAt: expiryIso(String(formData.get("expiresAt") || "")),
    isPinned: formData.get("isPinned") === "on"
  };
}

function expiryIso(value: string) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

function expiryInputValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function formatExpiryDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatNoticeStatus(status: string) {
  return status === "ARCHIVED" ? "Archived" : "Active";
}
