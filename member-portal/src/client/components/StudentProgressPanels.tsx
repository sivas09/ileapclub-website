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
  getStudentProgress,
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
    <section className="student-progress" id="club-members" aria-label="Student club members">
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
                <th>Student</th>
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
  const [resources, setResources] = useState<ResourceLink[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceLink | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStudentProgress(), getResourceLinks()])
      .then(([progressResult, resourceResult]) => {
        setProgress(progressResult);
        setResources(resourceResult.resources);
      })
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
          </div>
              </>
            );
          })()}
          {progress.summary.programLevelWarning ? <p className="admin-status is-error" role="alert">{progress.summary.programLevelWarning}</p> : null}

          <div className="student-context-card">
            <strong>{progress.summary.clubName}</strong>
            <span>{progress.summary.centreName} - {formatBandLadder(progress.summary.programLevel)}</span>
          </div>

          <DataPanel title="My Scores & Feedback">
            {progress.feedback.length ? (
              <div className="student-feedback-table-wrap">
                <table className="student-feedback-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Meeting</th>
                      <th>Club</th>
                      <th>Related Roles</th>
                      <th>Score</th>
                      <th>Feedback</th>
                      <th>Facilitator</th>
                      <th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.feedback.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.meetingDate)}</td>
                        <td>{entry.meetingTitle}</td>
                        <td>{entry.clubName}</td>
                        <td>{entry.roleName}</td>
                        <td>{entry.score}/100</td>
                        <td>{entry.feedback || "No feedback entered yet."}</td>
                        <td>{entry.facilitatorName}</td>
                        <td>{entry.attendanceStatus ?? "Not marked"}</td>
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
      <ResourcePanel resource={selectedResource} onClose={() => setSelectedResource(null)} />
    </section>
  );
}

