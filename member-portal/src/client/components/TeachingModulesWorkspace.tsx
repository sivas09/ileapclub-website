import { FormEvent, useEffect, useState } from "react";
import {
  getCurrentTeachingModules,
  PortalUser,
  removeCurrentTeachingModule,
  saveCurrentTeachingModule,
  TeachingModuleClub
} from "../api";
import { formatDate, isOperationalManagerRole, StatusBadge } from "./portalShared";

export function TeachingModulesWorkspace({ user }: { user: PortalUser }) {
  const [clubs, setClubs] = useState<TeachingModuleClub[]>([]);
  const [editingClubId, setEditingClubId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const canManage = isOperationalManagerRole(user.role);

  async function refresh() {
    setError("");
    try {
      const result = await getCurrentTeachingModules();
      setClubs(result.clubs);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh current teaching modules.");
    }
  }

  useEffect(() => {
    let isCurrent = true;

    getCurrentTeachingModules()
      .then((result) => {
        if (isCurrent) setClubs(result.clubs);
      })
      .catch((loadError) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Unable to load current teaching modules.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>, club: TeachingModuleClub) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus("");
    setError("");
    setIsSubmitting(true);

    try {
      await saveCurrentTeachingModule(club.id, {
        title: String(formData.get("title") || ""),
        moduleCode: String(formData.get("moduleCode") || ""),
        resourceUrl: String(formData.get("resourceUrl") || ""),
        description: String(formData.get("description") || "")
      });
      await refresh();
      setEditingClubId(null);
      setStatus(`Current teaching module saved for ${club.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the current teaching module.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(club: TeachingModuleClub) {
    if (!window.confirm(`Remove the current teaching module from ${club.name}?`)) {
      return;
    }

    setStatus("");
    setError("");
    setIsSubmitting(true);

    try {
      await removeCurrentTeachingModule(club.id);
      await refresh();
      setEditingClubId(null);
      setStatus(`Current teaching module removed from ${club.name}.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove the current teaching module.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="teaching-modules-workspace" id="teaching-modules" aria-label="Current teaching modules">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Club teaching resources</p>
          <h2>Current Teaching Modules</h2>
          <p>{canManage ? "Assign one current module to each club in your scope." : "Open the current module for each club assigned to you."}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={isLoading || isSubmitting}>Refresh</button>
      </div>

      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {isLoading ? <p className="loading-state">Loading current teaching modules...</p> : null}
      {!isLoading && !clubs.length ? (
        <p className="loading-state">{user.role === "FACILITATOR" ? "No directly assigned clubs were found." : "No clubs were found in your scope."}</p>
      ) : null}

      <div className="teaching-module-grid">
        {clubs.map((club) => {
          const teachingModule = club.currentTeachingModule;
          const isEditing = editingClubId === club.id;

          return (
            <article className="teaching-module-card" key={club.id}>
              <header>
                <div>
                  <p className="eyebrow">{club.centre.name}</p>
                  <h3>{club.name}</h3>
                  <span>{club.program}</span>
                </div>
                {canManage ? <StatusBadge isActive={club.isActive && club.centre.isActive} /> : null}
              </header>

              {teachingModule ? (
                <div className="teaching-module-current">
                  <div>
                    <strong>{teachingModule.title}</strong>
                    <span>{teachingModule.moduleCode}</span>
                    {teachingModule.description ? <p>{teachingModule.description}</p> : null}
                  </div>
                  <a
                    className="teaching-module-open"
                    href={teachingModule.resourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Current Teaching Module
                  </a>
                  <small>
                    Updated {formatDate(teachingModule.updatedAt)}
                    {teachingModule.updatedBy ? ` by ${teachingModule.updatedBy.firstName} ${teachingModule.updatedBy.lastName}` : ""}
                  </small>
                </div>
              ) : <p className="loading-state">No current teaching module assigned.</p>}

              {canManage ? (
                <div className="teaching-module-actions">
                  <button type="button" onClick={() => setEditingClubId(isEditing ? null : club.id)} disabled={isSubmitting}>
                    {isEditing ? "Cancel" : teachingModule ? "Replace or Update" : "Assign Module"}
                  </button>
                  {teachingModule ? (
                    <button type="button" className="danger-action" onClick={() => handleRemove(club)} disabled={isSubmitting}>
                      Remove Assignment
                    </button>
                  ) : null}
                </div>
              ) : null}

              {canManage && isEditing ? (
                <form className="teaching-module-form" onSubmit={(event) => handleSave(event, club)}>
                  <label>Module Title<input name="title" defaultValue={teachingModule?.title ?? ""} maxLength={160} required /></label>
                  <label>Module Number or Code<input name="moduleCode" defaultValue={teachingModule?.moduleCode ?? ""} maxLength={80} placeholder="Senior Module 4" required /></label>
                  <label>Resource URL<input name="resourceUrl" type="url" pattern="https://.*" defaultValue={teachingModule?.resourceUrl ?? ""} placeholder="https://..." maxLength={2048} required /></label>
                  <label>Short Description <span>Optional</span><textarea name="description" defaultValue={teachingModule?.description ?? ""} maxLength={500} rows={3} /></label>
                  <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Current Module"}</button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
