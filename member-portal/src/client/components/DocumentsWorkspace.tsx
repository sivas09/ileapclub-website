import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminOverview,
  addMeetingRoleSlot,
  assignClubFacilitator,
  assignMeetingSlot,
  BandDocument,
  BandRequirement,
  backfillPreviousBandRequirements,
  claimMeetingSlot,
  createBandDocument,
  createBandRequirement,
  createCentre,
  createClub,
  createMeeting,
  createMember,
  createResourceLink,
  createRoleDefinition,
  createUser,
  deleteDemoUser,
  deleteBandDocument,
  deleteBandRequirement,
  deleteResourceLink,
  deleteRoleDefinition,
  deleteSampleFeedback,
  deleteSampleUsers,
  downloadAgenda,
  editMeetingRoleSlot,
  fetchStudentProgressForManager,
  FeedbackReportEntry,
  getAdminOverview,
  getBandDocuments,
  getBandRequirements,
  getFeedbackReport,
  getMemberDetail,
  getMembers,
  getMeetingsOverview,
  getResourceLinks,
  getRoleDefinitions,
  Meeting,
  MemberDetail,
  MemberListEntry,
  MembersResponse,
  MeetingsOverview,
  permanentlyDeleteMember,
  PortalUser,
  Role,
  saveStudentMeetingFeedback,
  removeMeetingRoleSlot,
  removeClubFacilitator,
  releaseMeetingSlot,
  resetDemoMeetingData,
  resetUserPassword,
  ResourceLink,
  RoleDefinition,
  setCentreActive,
  setClubActive,
  setMemberActive,
  setUserActive,
  StudentProgress,
  toggleMeetingLock,
  updateBandDocument,
  updateBandRequirement,
  updateMember,
  updateMeetingDetails,
  updateResourceLink,
  updateRoleDefinition,
  updateStudentProfile,
  updateStudentRequirement,
  updateUser
} from "../api";
import {
  DataPanel,
  documentCategoryOptions,
  documentLink,
  formatBandLadder,
  formatCleanupSummary,
  formatDate,
  formatProgramLevel,
  formatResourceScope,
  formatRole,
  formatStudentClubs,
  formatStudentName,
  getNextBandLevel,
  HelpLabel,
  isDemoUser,
  isLeadershipMeetingRole,
  isStudentInClub,
  programLevelOptions,
  ResourceActions,
  ResourcePanel,
  resourceCategoryOptions,
  resourceIdFromHash,
  resourcesForRequirement,
  resourcesForRole,
  resourcesForRoleName,
  roleDefinitionsForMeeting,
  roleDefinitionsForSlot,
  roleSlotName,
  splitDisplayName,
  StatusBadge,
  SummaryTile,
  bandLevelOptions
} from "./portalShared";
type DocumentFilters = {
  programLevel: string;
  bandLevel: string;
  clubId: string;
  category: string;
  search: string;
  session: string;
  status: string;
};

type DocumentSort = "newest" | "oldest" | "name" | "band";

export function DocumentsWorkspace({ user }: { user: PortalUser }) {
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
    session: "",
    status: "ACTIVE"
  });
  const [sortOrder, setSortOrder] = useState<DocumentSort>("newest");
  const [editingDocument, setEditingDocument] = useState<BandDocument | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const sessionOptions = useMemo(() => {
    return Array.from(new Set(documents.map((document) => documentSession(document)))).sort((left, right) => left.localeCompare(right));
  }, [documents]);
  const displayedDocuments = useMemo(() => {
    const sessionDocuments = filters.session
      ? documents.filter((document) => documentSession(document) === filters.session)
      : documents;

    return [...sessionDocuments].sort((left, right) => compareDocuments(left, right, sortOrder));
  }, [documents, filters.session, sortOrder]);

  async function refreshDocuments(nextFilters = filters) {
    const { session: _session, ...serverFilters } = nextFilters;
    const data = await getBandDocuments(serverFilters);
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

    if (key !== "session") {
      refreshDocuments(nextFilters).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to filter documents."));
    }
  }

  function clearFilters() {
    const nextFilters: DocumentFilters = {
      programLevel: "",
      bandLevel: "",
      clubId: "",
      category: "",
      search: "",
      session: "",
      status: user.role === "ADMIN" ? "" : "ACTIVE"
    };

    setFilters(nextFilters);
    setSortOrder("newest");
    setError("");
    refreshDocuments(nextFilters).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to clear document filters."));
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
        bandLevel: String(formData.get("bandLevel") || "White"),
        sessionModule: String(formData.get("sessionModule") || ""),
        category: String(formData.get("category") || "Other"),
        clubId: String(formData.get("clubId") || "") || null
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

  async function handleDeleteDocument(document: BandDocument) {
    const confirmed = window.confirm(`Permanently delete document "${document.title}"? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await deleteBandDocument(document.id);
      await refreshDocuments();
      if (editingDocument?.id === document.id) {
        setEditingDocument(null);
      }
      setStatus("Document permanently deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete document.");
    } finally {
      setIsSubmitting(false);
    }
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
          Session
          <select value={filters.session} onChange={(event) => updateFilter("session", event.currentTarget.value)}>
            <option value="">All sessions</option>
            {sessionOptions.map((session) => <option key={session} value={session}>{session}</option>)}
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

      <div className="document-list-toolbar">
        <p aria-live="polite"><strong>{displayedDocuments.length}</strong> {displayedDocuments.length === 1 ? "document" : "documents"} found</p>
        <div className="document-list-controls">
          <label>
            Sort
            <select value={sortOrder} onChange={(event) => setSortOrder(event.currentTarget.value as DocumentSort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Document name A-Z</option>
              <option value="band">Band</option>
            </select>
          </label>
          <button type="button" className="document-clear-filters" onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>

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
          <label>Session / Module <span>Optional</span><input name="sessionModule" placeholder="Session 3, Module 2, Debate Week" /></label>
          <label>
            Category
            <select name="category" defaultValue="Session Materials">
              {documentCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>
            Club
            <select name="clubId" defaultValue={user.role === "FACILITATOR" && clubs.length === 1 ? clubs[0].id : ""} required={user.role === "FACILITATOR"}>
              {user.role === "ADMIN" ? <option value="">All clubs</option> : null}
              {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
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
      {!isLoading && !displayedDocuments.length ? <p className="loading-state">No documents match the selected filters.</p> : null}

      {!isLoading && displayedDocuments.length ? (
        <div className="document-list-wrap">
          <table className="document-list-table">
            <caption className="sr-only">Documents and management actions</caption>
            <thead>
              <tr>
                <th scope="col">Document Name</th>
                <th scope="col">Program</th>
                <th scope="col">Band</th>
                <th scope="col">Session</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedDocuments.map((document) => (
                <ManagerDocumentRow
                  key={document.id}
                  document={document}
                  clubs={clubs}
                  canEdit={user.role === "ADMIN" || (user.role === "FACILITATOR" && Boolean(document.clubId))}
                  canArchive={user.role === "ADMIN"}
                  canDelete={user.role === "ADMIN"}
                  canAssignGlobal={user.role === "ADMIN"}
                  isEditing={editingDocument?.id === document.id}
                  isSubmitting={isSubmitting}
                  onEdit={() => setEditingDocument(document)}
                  onCancelEdit={() => setEditingDocument(null)}
                  onSave={handleSaveDocument}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDeleteDocument}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ManagerDocumentRow({
  document,
  clubs,
  canEdit,
  canArchive,
  canDelete,
  canAssignGlobal,
  isEditing,
  isSubmitting,
  onEdit,
  onCancelEdit,
  onSave,
  onStatusChange,
  onDelete
}: {
  document: BandDocument;
  clubs: AdminOverview["clubs"];
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canAssignGlobal: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (documentId: string, payload: Parameters<typeof updateBandDocument>[1]) => void;
  onStatusChange: (document: BandDocument) => void;
  onDelete: (document: BandDocument) => void;
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
      sessionModule: String(formData.get("sessionModule") || ""),
      clubId: String(formData.get("clubId") || "") || null,
      category: String(formData.get("category") || "Other")
    });
  }

  const statusLabel = document.status === "ARCHIVED" ? "Archived" : "Active";

  return (
    <>
      <tr className={document.status === "ARCHIVED" ? "is-archived" : ""}>
        <td className="document-name-cell" data-label="Document Name">
          <strong title={document.title}>{document.title}</strong>
          <small title={document.description || "No description provided."}>{document.description || "No description provided."}</small>
        </td>
        <td data-label="Program">
          <span className="document-badge program-badge">{formatProgramLevel(document.programLevel)}</span>
        </td>
        <td data-label="Band">
          <span className={`document-badge band-badge ${bandBadgeClass(document.bandLevel)}`}>{document.bandLevel}</span>
        </td>
        <td data-label="Session">
          <span className="document-badge secondary-badge">{documentSession(document)}</span>
        </td>
        <td data-label="Category">
          <span className="document-badge secondary-badge">{document.category}</span>
        </td>
        <td data-label="Status">
          <span className={`document-badge status-badge ${document.status === "ARCHIVED" ? "is-archived" : "is-active"}`}>{statusLabel}</span>
        </td>
        <td className="document-updated-cell" data-label="Updated">
          <time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time>
        </td>
        <td className="document-row-actions" data-label="Actions">
          <div className="document-actions document-actions-compact">
            {link
              ? <a href={link} target="_blank" rel="noreferrer" aria-label={`Open or download ${document.title}`} title="Open or download document">Open</a>
              : <span className="document-disabled-action" title="Document link not added">No link</span>}
            {canEdit ? <button type="button" aria-label={`Edit ${document.title}`} onClick={onEdit}>Edit</button> : null}
            {canArchive ? (
              <button type="button" aria-label={`${document.status === "ARCHIVED" ? "Activate" : "Archive"} ${document.title}`} onClick={() => onStatusChange(document)} disabled={isSubmitting}>
                {document.status === "ARCHIVED" ? "Activate" : "Archive"}
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" className="danger-action" aria-label={`Delete ${document.title}`} onClick={() => onDelete(document)} disabled={isSubmitting}>
                Delete
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {isEditing ? (
        <tr className="document-edit-row">
          <td colSpan={8}>
            <form className="document-edit-form" onSubmit={handleSubmit}>
              <label>Document Title<input name="title" defaultValue={document.title} required /></label>
              <label>Description<textarea name="description" defaultValue={document.description ?? ""} rows={3} /></label>
              <label>Document Link<input name="fileUrl" type="url" defaultValue={document.fileUrl} placeholder="Paste Google Drive, PDF, or website link" /></label>
              <label>Session / Module<input name="sessionModule" defaultValue={document.sessionModule ?? ""} placeholder="Optional" /></label>
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
                  {canAssignGlobal ? <option value="">All clubs</option> : null}
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
          </td>
        </tr>
      ) : null}
    </>
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
  const groupedDocuments = groupDocumentsByCategory(documents);

  return (
    <DataPanel title={title}>
      {documents.length ? groupedDocuments.map((group) => (
        <section key={group.key} className="student-document-category">
          <div className="document-group-heading compact">
            <h3>{group.title}</h3>
            <span>{group.documents.length}</span>
          </div>
          <div className="document-card-grid compact">
            {group.documents.map((document) => (
              <ResourceCard key={document.id} document={document} />
            ))}
          </div>
        </section>
      )) : <p>{emptyText}</p>}
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
        <div><dt>Session</dt><dd>{document.sessionModule || "General"}</dd></div>
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

function documentSession(document: BandDocument) {
  return document.sessionModule?.trim() || "General";
}

function compareDocuments(left: BandDocument, right: BandDocument, sortOrder: DocumentSort) {
  if (sortOrder === "name") {
    return left.title.localeCompare(right.title);
  }

  if (sortOrder === "band") {
    return left.bandOrder - right.bandOrder || left.title.localeCompare(right.title);
  }

  const leftTime = new Date(left.updatedAt).getTime();
  const rightTime = new Date(right.updatedAt).getTime();
  return sortOrder === "oldest" ? leftTime - rightTime : rightTime - leftTime;
}

function bandBadgeClass(bandLevel: string) {
  const colourName = bandLevel.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `is-${colourName || "default"}`;
}

function groupDocumentsByCategory(documents: BandDocument[]) {
  const groups = new Map<string, { key: string; title: string; documents: BandDocument[] }>();

  documents.forEach((document) => {
    const key = document.category || "Other";

    if (!groups.has(key)) {
      groups.set(key, { key, title: key, documents: [] });
    }

    groups.get(key)!.documents.push(document);
  });

  return Array.from(groups.values());
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
  const [selectedResourceId, setSelectedResourceId] = useState(() => resourceIdFromHash());
  const [selectedResourceOverride, setSelectedResourceOverride] = useState<ResourceLink | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const canEdit = user.role === "ADMIN";
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId)
    ?? (selectedResourceOverride?.id === selectedResourceId ? selectedResourceOverride : null);

  async function refreshResources(nextFilters = filters) {
    const data = await getResourceLinks(nextFilters);
    setResources(data.resources);
  }

  useEffect(() => {
    refreshResources()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load resource links."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    function syncResourceRoute() {
      const nextResourceId = resourceIdFromHash();
      setSelectedResourceId(nextResourceId);
      setEditingResource(null);
      setSelectedResourceOverride((currentResource) => currentResource?.id === nextResourceId ? currentResource : null);
    }

    window.addEventListener("hashchange", syncResourceRoute);

    return () => window.removeEventListener("hashchange", syncResourceRoute);
  }, []);

  function updateFilter(key: keyof ResourceFilters, value: string) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setError("");
    refreshResources(nextFilters).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to filter resource links."));
  }

  function openResourceDetails(resource: ResourceLink) {
    setSelectedResourceOverride(resource);
    setSelectedResourceId(resource.id);
    setEditingResource(null);
    window.location.hash = `resources/${resource.id}`;
  }

  function returnToResourceList() {
    setSelectedResourceId(null);
    setSelectedResourceOverride(null);
    setEditingResource(null);
    window.location.hash = "resource-links";
  }

  async function handleCreateResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = resourcePayloadFromForm(form);
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const result = await createResourceLink(payload);
      form.reset();
      const nextFilters = { category: "", search: "", status: "ACTIVE" };
      setFilters(nextFilters);
      setResources((currentResources) => [result.resource, ...currentResources.filter((resource) => resource.id !== result.resource.id)]);
      await refreshResources(nextFilters);
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
      const result = await updateResourceLink(resourceId, payload);
      setResources((currentResources) => currentResources.map((resource) => resource.id === resourceId ? result.resource : resource));
      if (selectedResourceId === resourceId) {
        setSelectedResourceOverride(result.resource);
      }
      await refreshResources();
      setEditingResource(null);
      setStatus("Resource link updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update resource link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteResource(resource: ResourceLink) {
    const confirmed = window.confirm(`Permanently delete resource "${resource.title}"? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await deleteResourceLink(resource.id);
      await refreshResources();
      if (selectedResourceId === resource.id) {
        setSelectedResourceId(null);
        setSelectedResourceOverride(null);
        setEditingResource(null);
        window.location.hash = "resource-links";
      }
      setStatus("Resource permanently deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete resource.");
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

      {selectedResourceId ? (
        <ResourceLinkDetails
          resource={selectedResource}
          canEdit={canEdit}
          isEditing={editingResource?.id === selectedResourceId}
          isLoading={isLoading}
          isSubmitting={isSubmitting}
          onBack={returnToResourceList}
          onEdit={() => selectedResource ? setEditingResource(selectedResource) : null}
          onCancelEdit={() => setEditingResource(null)}
          onSave={handleSaveResource}
          onStatusChange={(targetResource) => handleSaveResource(targetResource.id, {
            status: targetResource.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED"
          })}
          onDelete={handleDeleteResource}
        />
      ) : (
        <>
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
                {isAddFormOpen ? "Cancel New Resource" : "Add Resource"}
              </button>
            </div>
          ) : null}

          {canEdit && isAddFormOpen ? <ResourceLinkForm isSubmitting={isSubmitting} onSubmit={handleCreateResource} /> : null}
          {isLoading ? <p className="loading-state">Loading resource links...</p> : null}
          {!isLoading && !resources.length ? <p className="loading-state">No resource links found.</p> : null}

          {!isLoading && resources.length ? (
            <ResourceLinksTable
              resources={resources}
              canDelete={canEdit}
              isSubmitting={isSubmitting}
              onOpenResource={openResourceDetails}
              onDeleteResource={handleDeleteResource}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function ResourceLinksTable({
  resources,
  canDelete,
  isSubmitting,
  onOpenResource,
  onDeleteResource
}: {
  resources: ResourceLink[];
  canDelete: boolean;
  isSubmitting: boolean;
  onOpenResource: (resource: ResourceLink) => void;
  onDeleteResource: (resource: ResourceLink) => void;
}) {
  return (
    <div className="resource-table-wrap">
      <table className="resource-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Role</th>
            <th>Program / Band</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={resource.id} className={resource.status === "ARCHIVED" ? "is-archived" : ""}>
              <td data-label="Title">
                <button type="button" className="resource-title-button" onClick={() => onOpenResource(resource)}>
                  {resource.title}
                </button>
              </td>
              <td data-label="Type">{resource.category}</td>
              <td data-label="Role">{resource.roleKey || "Any"}</td>
              <td data-label="Program / Band">{formatResourceScope(resource)}</td>
              <td data-label="Status"><StatusBadge isActive={resource.status !== "ARCHIVED"} /></td>
              <td data-label="Actions">
                <button type="button" className="text-action" onClick={() => onOpenResource(resource)}>View</button>
                {canDelete ? (
                  <button type="button" className="text-action danger-action" onClick={() => onDeleteResource(resource)} disabled={isSubmitting}>
                    Delete
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResourceLinkDetails({
  resource,
  canEdit,
  isEditing,
  isLoading,
  isSubmitting,
  onEdit,
  onBack,
  onCancelEdit,
  onSave,
  onStatusChange,
  onDelete
}: {
  resource: ResourceLink | null;
  canEdit: boolean;
  isEditing: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onBack: () => void;
  onCancelEdit: () => void;
  onSave: (resourceId: string, payload: Parameters<typeof updateResourceLink>[1]) => void;
  onStatusChange: (resource: ResourceLink) => void;
  onDelete: (resource: ResourceLink) => void;
}) {
  if (isLoading) {
    return <p className="loading-state">Loading resource details...</p>;
  }

  if (!resource) {
    return (
      <section className="resource-detail-page" aria-label="Resource details">
        <button type="button" className="text-action" onClick={onBack}>Back to Resources</button>
        <p className="loading-state">Resource not found or not available with the current filters.</p>
      </section>
    );
  }

  if (isEditing) {
    return (
      <section className="resource-detail-page" aria-label={`Edit ${resource.title}`}>
        <button type="button" className="text-action" onClick={onBack}>Back to Resources</button>
        <ResourceLinkForm
          resource={resource}
          isSubmitting={isSubmitting}
          onSubmit={(event) => {
            event.preventDefault();
            onSave(resource.id, resourcePayloadFromForm(event.currentTarget));
          }}
          onCancel={onCancelEdit}
        />
      </section>
    );
  }

  return (
    <section className={`resource-detail-page ${resource.status === "ARCHIVED" ? "is-archived" : ""}`} aria-label={`Resource details for ${resource.title}`}>
      <button type="button" className="text-action" onClick={onBack}>Back to Resources</button>
      <div className="resource-detail-header">
        <div>
          <p className="eyebrow">{resource.category}</p>
          <h3>{resource.title}</h3>
        </div>
        <StatusBadge isActive={resource.status !== "ARCHIVED"} />
      </div>
      <dl className="resource-detail-meta">
        <div><dt>Type</dt><dd>{resource.category}</dd></div>
        <div><dt>Role</dt><dd>{resource.roleKey || "Any"}</dd></div>
        <div><dt>Program</dt><dd>{formatProgramLevel(resource.programLevel)}</dd></div>
        <div><dt>Band</dt><dd>{resource.bandLevel || "Any"}</dd></div>
        <div><dt>Requirement</dt><dd>{resource.requirementName || resource.requirementId || "Any"}</dd></div>
        <div><dt>Status</dt><dd>{resource.status === "ARCHIVED" ? "Archived" : "Active"}</dd></div>
      </dl>
      <div className="resource-detail-description">
        <h4>Description</h4>
        <p>{resource.explanation}</p>
      </div>
      <ResourceActions resource={resource} />
      {canEdit ? (
        <div className="document-actions">
          <button type="button" onClick={onEdit}>Edit</button>
          <button type="button" onClick={() => onStatusChange(resource)} disabled={isSubmitting}>
            {resource.status === "ARCHIVED" ? "Restore" : "Archive"}
          </button>
        </div>
      ) : null}
      {canEdit ? (
        <div className="member-destructive-actions">
          <button type="button" className="text-action danger-action" onClick={() => onDelete(resource)} disabled={isSubmitting}>
            Delete
          </button>
        </div>
      ) : null}
    </section>
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
      <h3>{resource ? "Edit Resource" : "Add Resource"}</h3>
      <label>Title<input name="title" defaultValue={resource?.title ?? ""} required /></label>
      <label>
        Type / Category
        <input name="category" defaultValue={resource?.category ?? "Role Guide"} list="resource-category-options" required />
      </label>
      <datalist id="resource-category-options">
        {resourceCategoryOptions.map((category) => <option key={category} value={category} />)}
      </datalist>
      <label>Related Role or Speech Type <span>Optional</span><input name="roleKey" defaultValue={resource?.roleKey ?? ""} placeholder="iChair, Prepared Speech, Timer Report" /></label>
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
      <label className="document-link-field">Description<textarea name="explanation" defaultValue={resource?.explanation ?? ""} rows={3} required /></label>
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


