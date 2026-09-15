import { FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
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
import {
  documentText,
  noticeDocument,
  type NoticeDocument,
  type NoticeInline,
  serializeNoticeDocument
} from "../../shared/noticeRichText";
import { noticeDocumentFromPaste, noticeDocumentToEditorHtml } from "../noticePaste";
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
    const payload = noticePayload(formData);
    const messageError = validateNoticeMessage(payload.message);

    if (messageError) {
      setError(messageError);
      setStatusMessage("");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatusMessage("");

    try {
      await createNotice(payload);
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
    const payload = noticePayload(formData);
    const messageError = validateNoticeMessage(payload.message);

    if (messageError) {
      setError(messageError);
      setStatusMessage("");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatusMessage("");

    try {
      await updateNotice(noticeId, payload);
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
          <NoticeFields clubs={clubs} allowAllClubs={user.role === "ADMIN"} />
          <button type="submit" disabled={isSubmitting}>Post Notice</button>
        </form>
      ) : null}

      {isLoading ? <p className="loading-state">Loading notices...</p> : null}
      {!isLoading && !notices.length ? <p className="loading-state notice-empty-state">No notices match the selected filters.</p> : null}

      {!isLoading && notices.length ? (
        <div className="notice-management-list" aria-label="Notices and management actions">
          {notices.map((notice) => (
            <ManagerNoticeCard
              key={notice.id}
              notice={notice}
              clubs={clubs}
              allowAllClubs={user.role === "ADMIN"}
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
        </div>
      ) : null}
    </section>
  );
}

function ManagerNoticeCard({
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
    <article className={`notice-card ${notice.isPinned ? "is-important" : ""} ${notice.status === "ARCHIVED" ? "is-archived" : ""}`}>
      <div className="notice-card-heading">
        <div>
          <div className="notice-title-line">
            <h3>{notice.title}</h3>
            {notice.isPinned ? <span className="notice-important-badge">Important</span> : null}
          </div>
        </div>
        <span className={`document-badge status-badge ${notice.status === "ARCHIVED" ? "is-archived" : "is-active"}`}>{statusLabel}</span>
      </div>

      <NoticeMessage message={notice.message} />

      <dl className="notice-meta">
        <div><dt>Club</dt><dd>{notice.clubName}</dd></div>
        <div><dt>Posted by</dt><dd>{notice.createdBy}</dd></div>
        <div><dt>Posted</dt><dd><time dateTime={notice.createdAt}>{formatDate(notice.createdAt)}</time></dd></div>
        <div><dt>Expires</dt><dd>{notice.expiresAt ? <time dateTime={notice.expiresAt}>{formatExpiryDate(notice.expiresAt)}</time> : "No expiry"}</dd></div>
      </dl>

      <div className="document-actions notice-card-actions">
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

      {isEditing ? (
        <form className="document-edit-form notice-form notice-card-edit-form" onSubmit={handleSubmit}>
          <NoticeFields notice={notice} clubs={clubs} allowAllClubs={allowAllClubs} />
          <div className="document-actions">
            <button type="submit" disabled={isSubmitting}>Save</button>
            <button type="button" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export function NoticeFields({ notice, clubs, allowAllClubs }: { notice?: Notice; clubs: Club[]; allowAllClubs: boolean }) {
  const [initialDocument] = useState(() => noticeDocument(notice?.message ?? ""));
  const [message, setMessage] = useState(() => serializeNoticeDocument(initialDocument));
  const editorRef = useRef<HTMLDivElement>(null);
  const formattingHelpId = useId();
  const messageLabelId = useId();
  const messageText = documentText(noticeDocument(message));

  function syncEditor() {
    if (editorRef.current) {
      setMessage(serializeNoticeDocument(richTextDocumentFromElement(editorRef.current)));
    }
  }

  function applyFormat(command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList") {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const selection = window.getSelection();

    if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) {
      editor.focus();
    }

    document.execCommand(command, false);
    syncEditor();
  }

  return (
    <>
      <label>
        Title
        <input name="title" defaultValue={notice?.title ?? ""} maxLength={noticeLimits.title} required />
      </label>
      <div className="notice-message-field notice-rich-text-field" role="group" aria-labelledby={messageLabelId}>
        <span className="notice-field-label" id={messageLabelId}>Message</span>
        <div className="notice-editor-toolbar" role="toolbar" aria-label="Message formatting">
          <button type="button" className="text-action" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("bold")}><strong aria-hidden="true">B</strong></button>
          <button type="button" className="text-action" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("italic")}><em aria-hidden="true">I</em></button>
          <button type="button" className="text-action" aria-label="Underline" title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("underline")}><u aria-hidden="true">U</u></button>
          <span className="notice-toolbar-divider" aria-hidden="true" />
          <button type="button" className="text-action notice-list-tool" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("insertUnorderedList")}><span aria-hidden="true">• List</span></button>
          <button type="button" className="text-action notice-list-tool" aria-label="Numbered list" title="Numbered list" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("insertOrderedList")}><span aria-hidden="true">1. List</span></button>
        </div>
        <div
          ref={editorRef}
          className="notice-rich-text-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-required="true"
          aria-invalid={messageText.length > noticeLimits.message}
          aria-describedby={formattingHelpId}
          data-placeholder="Write the notice message…"
          onInput={syncEditor}
          onBlur={syncEditor}
          onPaste={(event) => {
            event.preventDefault();
            const html = event.clipboardData.getData("text/html");
            const plainText = event.clipboardData.getData("text/plain");

            if (html.trim()) {
              const pastedDocument = noticeDocumentFromPaste(html, plainText);
              const safeHtml = noticeDocumentToEditorHtml(pastedDocument);

              if (safeHtml) {
                document.execCommand("insertHTML", false, safeHtml);
              } else {
                document.execCommand("insertText", false, plainText);
              }
            } else {
              document.execCommand("insertText", false, plainText);
            }

            syncEditor();
          }}
          onDrop={(event) => event.preventDefault()}
        >
          <NoticeDocumentContent document={initialDocument} />
        </div>
        <input type="hidden" name="message" value={message} />
        <div className="notice-editor-help">
          <small id={formattingHelpId} className="notice-formatting-help">Select text, then use the toolbar to format it.</small>
          <small className={messageText.length > noticeLimits.message ? "is-over-limit" : ""}>{messageText.length}/{noticeLimits.message}</small>
        </div>
      </div>
      {messageText.trim() ? (
        <div className="notice-preview" aria-live="polite">
          <span>Preview</span>
          <NoticeMessage message={message} />
        </div>
      ) : null}
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
            <article className={`notice-card student-notice-card ${notice.isPinned ? "is-important" : ""}`} key={notice.id}>
              <div className="notice-card-heading student-notice-heading">
                <h3>{notice.title}</h3>
                {notice.isPinned ? <span className="notice-important-badge">Important</span> : null}
              </div>
              <NoticeMessage message={notice.message} />
              <dl className="notice-meta student-notice-meta">
                <div><dt>Club</dt><dd>{notice.clubName}</dd></div>
                <div><dt>Posted by</dt><dd>{notice.createdBy}</dd></div>
                <div><dt>Posted</dt><dd><time dateTime={notice.createdAt}>{formatDate(notice.createdAt)}</time></dd></div>
                <div><dt>Expires</dt><dd>{notice.expiresAt ? <time dateTime={notice.expiresAt}>{formatExpiryDate(notice.expiresAt)}</time> : "No expiry"}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function NoticeMessage({ message }: { message: string }) {
  return (
    <div className="notice-message">
      <NoticeDocumentContent document={noticeDocument(message)} />
    </div>
  );
}

function NoticeDocumentContent({ document: richDocument }: { document: NoticeDocument }) {
  return richDocument.blocks.map((block, blockIndex) => block.type === "p" ? (
    <p key={`paragraph-${blockIndex}`}><NoticeInlineContent content={block.content} /></p>
  ) : block.type === "ul" ? (
    <ul key={`list-${blockIndex}`}>
      {block.items.map((item, itemIndex) => <li key={`${blockIndex}-${itemIndex}`}><NoticeInlineContent content={item} /></li>)}
    </ul>
  ) : (
    <ol key={`list-${blockIndex}`}>
      {block.items.map((item, itemIndex) => <li key={`${blockIndex}-${itemIndex}`}><NoticeInlineContent content={item} /></li>)}
    </ol>
  ));
}

function NoticeInlineContent({ content }: { content: NoticeInline[] }) {
  return content.map((inline, index) => {
    if (inline.type === "br") {
      return <br key={`break-${index}`} />;
    }

    let rendered: ReactNode = inline.text;

    if (inline.bold) rendered = <strong>{rendered}</strong>;
    if (inline.italic) rendered = <em>{rendered}</em>;
    if (inline.underline) rendered = <u>{rendered}</u>;
    return <span key={`text-${index}`}>{rendered}</span>;
  });
}

function richTextDocumentFromElement(element: HTMLElement): NoticeDocument {
  const blocks: NoticeDocument["blocks"] = [];
  let looseContent: NoticeInline[] = [];

  function flushLooseContent() {
    if (looseContent.length) {
      blocks.push({ type: "p", content: looseContent });
      looseContent = [];
    }
  }

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE || isInlineElement(node)) {
      collectInlineContent(node, {}, looseContent);
      continue;
    }

    if (!(node instanceof HTMLElement)) {
      continue;
    }

    const tag = node.tagName.toLowerCase();

    if (tag === "ul" || tag === "ol") {
      flushLooseContent();
      const items = Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((item) => {
          const content: NoticeInline[] = [];
          collectInlineContent(item, {}, content);
          return content;
        });
      blocks.push({ type: tag, items });
    } else {
      flushLooseContent();
      const content: NoticeInline[] = [];
      collectInlineContent(node, {}, content);
      blocks.push({ type: "p", content: content.length ? content : [{ type: "br" }] });
    }
  }

  flushLooseContent();
  return { type: "doc", blocks };
}

type InlineMarks = { bold?: true; italic?: true; underline?: true };

function collectInlineContent(node: Node, marks: InlineMarks, result: NoticeInline[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) {
      result.push({ type: "text", text: node.textContent, ...marks });
    }
    return;
  }

  if (!(node instanceof HTMLElement)) {
    return;
  }

  const tag = node.tagName.toLowerCase();

  if (tag === "br") {
    result.push({ type: "br" });
    return;
  }

  const nextMarks: InlineMarks = { ...marks };
  if (tag === "strong" || tag === "b") nextMarks.bold = true;
  if (tag === "em" || tag === "i") nextMarks.italic = true;
  if (tag === "u") nextMarks.underline = true;

  for (const child of Array.from(node.childNodes)) {
    collectInlineContent(child, nextMarks, result);
  }
}

function isInlineElement(node: Node) {
  return node instanceof HTMLElement && ["br", "strong", "b", "em", "i", "u", "span"].includes(node.tagName.toLowerCase());
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

function validateNoticeMessage(message: string) {
  const length = documentText(noticeDocument(message)).trim().length;

  if (!length) {
    return "Enter a notice message.";
  }

  if (length > noticeLimits.message) {
    return `Keep the notice message to ${noticeLimits.message.toLocaleString("en-CA")} characters or fewer.`;
  }

  return "";
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
