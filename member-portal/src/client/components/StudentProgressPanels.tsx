import { FormEvent, useEffect, useState } from "react";
import {
  createLearningReflection,
  deleteLearningReflection,
  getMemberDetail,
  getOwnMemberPointsProgress,
  getMembers,
  getResourceLinks,
  getOwnLearningReflections,
  getStudentProgress,
  LearningReflection,
  MemberDetail,
  MemberListEntry,
  MemberPointsProgress,
  OwnMemberPaymentStatus,
  PortalUser,
  ResourceLink,
  StudentProgress,
  updateLearningReflection
} from "../api";
import {
  DataPanel,
  formatBandLadder,
  formatDate,
  formatProgramLevel,
  getNextBandLevel,
  HelpLabel,
  ResourcePanel,
  resourcesForRequirement,
  resourcesForRoleName,
  SummaryTile
} from "./portalShared";

export function StudentHomeSummaryView({
  user,
  progress,
  paymentStatus,
  error = "",
  isLoading = false
}: {
  user: PortalUser;
  progress: StudentProgress | null;
  paymentStatus: OwnMemberPaymentStatus | null;
  error?: string;
  isLoading?: boolean;
}) {
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
        <article className={`student-payment-status${paymentStatus ? (paymentStatus.status === "PAID" ? " is-paid" : " is-not-paid") : ""}`}>
          <span>Payment Status</span>
          <strong>{paymentStatus ? (paymentStatus.status === "PAID" ? "Paid" : "Not Paid") : (isLoading ? "Loading..." : "Unavailable")}</strong>
          {paymentStatus ? (
            <small>
              {paymentStatus.status === "PAID"
                ? "Payment received for this month. Thank you."
                : "Payment not recorded for this month. Please contact iLEAP Club or complete your payment."}
            </small>
          ) : null}
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

export function StudentClubMembersPanel() {
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
    <section className="student-progress" id="club-members" aria-label="Club members">
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
                <th>Member</th>
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

export function StudentProgressDashboard() {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [pointsProgress, setPointsProgress] = useState<MemberPointsProgress | null>(null);
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLink | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStudentProgress(), getResourceLinks(), getOwnMemberPointsProgress()])
      .then(([progressResult, resourceResult, pointsResult]) => {
        setProgress(progressResult);
        setResources(resourceResult.resources);
        setPointsProgress(pointsResult);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load progress."))
      .finally(() => setIsLoading(false));
  }, []);

  const feedbackRows = progress ? [
    ...progress.memberFeedback.map((entry) => ({
      id: `member-${entry.id}`,
      date: entry.updatedAt || entry.createdAt,
      feedback: entry.feedback,
      facilitatorName: entry.facilitatorName
    })),
    ...progress.feedback
      .filter((entry) => Boolean(entry.feedback))
      .map((entry) => ({
        id: `meeting-${entry.id}`,
        date: entry.scoredAt || entry.meetingDate,
        feedback: entry.feedback || "",
        facilitatorName: entry.facilitatorName
      }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()) : [];

  return (
    <section className="student-progress" id="progress" aria-label="Member progress dashboard">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">My progress</p>
          <h2>Member Progress Dashboard</h2>
        </div>
      </div>

      {isLoading ? <p className="loading-state">Loading progress...</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}

      {progress ? (
        <>
          {(() => {
            const completedRequirements = progress.requirements.filter((entry) => entry.isCompleted).length;
            const currentBandRequirements = progress.requirements.filter((entry) => entry.requirement.bandLevel === progress.summary.bandLevel);
            const completedCurrentBandRequirements = currentBandRequirements.filter((entry) => entry.isCompleted).length;

            return (
              <>
          <div className="progress-summary-grid">
            <SummaryTile label="Program Level" valueText={formatProgramLevel(progress.summary.programLevel)} />
            <SummaryTile label="Current Band" valueText={progress.summary.bandLevel} />
            <SummaryTile label="Next Band" valueText={getNextBandLevel(progress.summary.bandLevel) ?? "Final band"} />
            <SummaryTile label="Overall Progress" valueText={progress.requirements.length ? `${completedRequirements}/${progress.requirements.length}` : "N/A"} />
            <SummaryTile label="Current Band Progress" valueText={currentBandRequirements.length ? `${completedCurrentBandRequirements}/${currentBandRequirements.length}` : "N/A"} />
            <SummaryTile label="Attendance" valueText={progress.summary.attendanceRate === null ? "N/A" : `${progress.summary.attendanceRate}%`} />
            <SummaryTile label="Roles Completed" value={progress.summary.rolesCompleted} />
            <SummaryTile label="Average Score" valueText={progress.summary.averageScore === null ? "N/A" : `${progress.summary.averageScore}`} />
            <SummaryTile label="My Points" value={pointsProgress?.totalPoints ?? 0} />
          </div>
              </>
            );
          })()}
          {progress.summary.programLevelWarning ? <p className="admin-status is-error" role="alert">{progress.summary.programLevelWarning}</p> : null}

          <div className="student-context-card">
            <strong>{progress.summary.clubName}</strong>
            <span>{progress.summary.centreName} - {formatBandLadder(progress.summary.programLevel)}</span>
          </div>

          <StudentPointsProgress progress={pointsProgress} />

          <LearningReflectionPanel progress={progress} />

          <DataPanel title="My Feedback">
            {feedbackRows.length ? (
              <div className="student-feedback-table-wrap">
                <table className="student-feedback-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Feedback</th>
                      <th>Facilitator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackRows.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.date)}</td>
                        <td>{entry.feedback}</td>
                        <td>{entry.facilitatorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p>No facilitator feedback yet.</p>}
          </DataPanel>

          <DataPanel title="Band Requirements Checklist">
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
                    <em>{entry.isCompleted ? "Completed" : "Not Completed"} ({entry.currentCount}/{entry.requirement.targetCount})</em>
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
                      <strong>{attendanceStatusLabel(attendance.status)}</strong>
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

export function StudentPointsProgress({ progress }: { progress: MemberPointsProgress | null }) {
  return (
    <div className="student-progress-grid student-points-progress">
      <DataPanel title="Progress Notes from Staff">
        {progress?.progressNote?.note ? (
          <>
            <p>{progress.progressNote.note}</p>
            <small>
              Updated {formatDate(progress.progressNote.updatedAt)}
              {progress.progressNote.updatedBy ? ` by ${progress.progressNote.updatedBy.firstName} ${progress.progressNote.updatedBy.lastName}` : ""}
            </small>
          </>
        ) : <p>No progress notes from staff yet.</p>}
      </DataPanel>
      <DataPanel title="Recent Point History">
        {progress?.transactions.length ? (
          <ul className="record-list">
            {progress.transactions.map((transaction) => (
              <li key={transaction.id}>
                <strong>{formatDate(transaction.awardedAt)} - +{transaction.pointsDelta} points</strong>
                <span>{transaction.reason || "No reason entered."}</span>
              </li>
            ))}
          </ul>
        ) : <p>No points have been awarded yet.</p>}
      </DataPanel>
    </div>
  );
}

export function attendanceStatusLabel(status: string) {
  if (status === "PRESENT") return "Present";
  if (status === "ABSENT") return "Absent";
  return "Not Marked";
}

function createEmptyReflectionForm() {
  return {
    reflectionDate: todayDateInput(),
    whatLearned: "",
    whatDidWell: "",
    whatToImprove: "",
    bandRequirementId: "",
    thinksBandRequirementCompleted: false
  };
}

export function LearningReflectionPanel({ progress }: { progress: StudentProgress }) {
  const [reflections, setReflections] = useState<LearningReflection[]>([]);
  const [form, setForm] = useState(createEmptyReflectionForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getOwnLearningReflections()
      .then((result) => setReflections(result.reflections))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load reflections."));
  }, []);

  async function submitReflection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSaving(true);

    const payload = {
      reflectionDate: form.reflectionDate,
      whatLearned: form.whatLearned.trim(),
      whatDidWell: form.whatDidWell.trim(),
      whatToImprove: form.whatToImprove.trim(),
      bandRequirementId: form.thinksBandRequirementCompleted && form.bandRequirementId ? form.bandRequirementId : null,
      thinksBandRequirementCompleted: form.thinksBandRequirementCompleted
    };

    try {
      const result = editingId
        ? await updateLearningReflection(editingId, payload)
        : await createLearningReflection(payload);
      setReflections((current) => editingId
        ? current.map((entry) => entry.id === editingId ? result.reflection : entry)
        : [result.reflection, ...current]);
      setForm(createEmptyReflectionForm());
      setEditingId(null);
      setStatus(editingId ? "Reflection updated successfully." : "Reflection saved successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save reflection.");
    } finally {
      setIsSaving(false);
    }
  }

  function editReflection(reflection: LearningReflection) {
    setEditingId(reflection.id);
    setForm({
      reflectionDate: reflection.reflectionDate.slice(0, 10),
      whatLearned: reflection.whatLearned,
      whatDidWell: reflection.whatDidWell,
      whatToImprove: reflection.whatToImprove,
      bandRequirementId: reflection.bandRequirement?.id ?? "",
      thinksBandRequirementCompleted: reflection.thinksBandRequirementCompleted
    });
    setError("");
    setStatus("");
  }

  async function removeReflection(reflectionId: string) {
    if (!window.confirm("Delete this reflection?")) return;
    setError("");
    setStatus("");
    try {
      await deleteLearningReflection(reflectionId);
      setReflections((current) => current.filter((entry) => entry.id !== reflectionId));
      setStatus("Reflection deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete reflection.");
    }
  }

  return (
    <DataPanel title="My Learning Reflection">
      <p className="field-note">Capture a short learning reflection. Your self-check does not officially complete a band requirement; staff approval is still required.</p>
      {status ? <p className="admin-status is-success" role="status">{status}</p> : null}
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      <form className="learning-reflection-form" onSubmit={submitReflection}>
        <label>
          Reflection Date
          <input type="date" required value={form.reflectionDate} onChange={(event) => setForm((current) => ({ ...current, reflectionDate: event.currentTarget.value }))} />
        </label>
        <ReflectionTextField label="What I learned" value={form.whatLearned} onChange={(value) => setForm((current) => ({ ...current, whatLearned: value }))} />
        <ReflectionTextField label="What I did well" value={form.whatDidWell} onChange={(value) => setForm((current) => ({ ...current, whatDidWell: value }))} />
        <ReflectionTextField label="What I want to improve" value={form.whatToImprove} onChange={(value) => setForm((current) => ({ ...current, whatToImprove: value }))} />
        <label className="reflection-checkbox">
          <input type="checkbox" checked={form.thinksBandRequirementCompleted} onChange={(event) => setForm((current) => ({ ...current, thinksBandRequirementCompleted: event.currentTarget.checked, bandRequirementId: event.currentTarget.checked ? current.bandRequirementId : "" }))} />
          I think I completed a band requirement today.
        </label>
        {form.thinksBandRequirementCompleted ? (
          <label>
            Related requirement (optional)
            <select value={form.bandRequirementId} onChange={(event) => setForm((current) => ({ ...current, bandRequirementId: event.currentTarget.value }))}>
              <option value="">No requirement selected</option>
              {progress.requirements.map((entry) => <option key={entry.requirement.id} value={entry.requirement.id}>{entry.requirement.bandLevel} - {entry.requirement.name}</option>)}
            </select>
          </label>
        ) : null}
        <div className="member-row-actions reflection-submit-actions">
          <button type="submit" className="reflection-primary-action" disabled={isSaving || !form.reflectionDate || !form.whatLearned.trim() || !form.whatDidWell.trim() || !form.whatToImprove.trim()}>{editingId ? "Update Reflection" : "Save Reflection"}</button>
          {editingId ? <button type="button" className="text-action" onClick={() => { setEditingId(null); setForm(createEmptyReflectionForm()); }} disabled={isSaving}>Cancel</button> : null}
        </div>
      </form>

      <LearningReflectionHistory reflections={reflections} onEdit={editReflection} onDelete={removeReflection} />
    </DataPanel>
  );
}

export function LearningReflectionHistory({
  reflections,
  onEdit,
  onDelete
}: {
  reflections: LearningReflection[];
  onEdit: (reflection: LearningReflection) => void;
  onDelete: (reflectionId: string) => void;
}) {
  return (
    <div className="learning-reflection-list">
      {reflections.length ? reflections.map((reflection) => (
        <article key={reflection.id}>
          <div className="reflection-heading">
            <strong>Reflection Date: {formatDate(reflection.reflectionDate)}</strong>
          </div>
          <dl>
            <div><dt>What I learned</dt><dd>{reflection.whatLearned}</dd></div>
            <div><dt>What I did well</dt><dd>{reflection.whatDidWell}</dd></div>
            <div><dt>What I want to improve</dt><dd>{reflection.whatToImprove}</dd></div>
          </dl>
          {reflection.thinksBandRequirementCompleted ? <p className="reflection-self-check">Self-check: I think I completed {reflection.bandRequirement ? `${reflection.bandRequirement.bandLevel} - ${reflection.bandRequirement.name}` : "a band requirement"}. Staff sign-off is still required.</p> : null}
          {reflection.facilitatorResponse ? <p className="reflection-response"><strong>Staff response{reflection.respondedBy ? ` from ${reflection.respondedBy}` : ""}:</strong> {reflection.facilitatorResponse}</p> : null}
          <div className="member-row-actions">
            <button type="button" className="text-action" onClick={() => onEdit(reflection)}>Edit</button>
            {reflection.canDelete ? <button type="button" className="danger-action" onClick={() => onDelete(reflection.id)}>Delete</button> : null}
          </div>
        </article>
      )) : <p>No reflections yet.</p>}
    </div>
  );
}

function todayDateInput() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function ReflectionTextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="reflection-label"><span>{label}</span><small>{value.length}/200</small></span>
      <textarea rows={3} required maxLength={200} value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}
