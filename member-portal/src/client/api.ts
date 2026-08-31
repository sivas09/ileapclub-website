export type Role = "ADMIN" | "FACILITATOR" | "STUDENT";

export type PortalUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
};

type LoginResponse = {
  token: string;
  user: PortalUser;
};

export type Centre = {
  id: string;
  name: string;
  province: string;
  city: string;
  address?: string | null;
  isActive: boolean;
  clubs?: Club[];
};

export type Club = {
  id: string;
  centreId: string;
  name: string;
  program: string;
  isActive: boolean;
  centre?: Centre;
  studentMemberships?: StudentClubMembership[];
  facilitators?: ClubFacilitator[];
};

export type Student = {
  id: string;
  grade: string;
  programLevel?: string | null;
  bandLevel: string;
  user: PortalUser;
  clubMemberships?: StudentClubMembership[];
};

export type StudentClubMembership = {
  id: string;
  studentId: string;
  clubId: string;
  status: string;
  club: Club;
};

export type ClubFacilitator = {
  id: string;
  clubId: string;
  facilitatorId: string;
  facilitator: PortalUser;
};

export type RoleDefinition = {
  id: string;
  name: string;
  description?: string | null;
  category?: string;
  programLevel?: string | null;
  level?: string | null;
  sortOrder?: number;
  isActive: boolean;
};

export type MeetingRoleSlot = {
  id: string;
  slotLabel: string;
  sortOrder: number;
  assignedStudentId?: string | null;
  roleDefinition: RoleDefinition;
  assignedStudent?: Student | null;
  score?: MeetingRoleScore | null;
};

export type Meeting = {
  id: string;
  clubId: string;
  title: string;
  templateType: string;
  meetingDate: string;
  startTime: string;
  location?: string | null;
  isRoleLocked: boolean;
  club: Club;
  roleSlots: MeetingRoleSlot[];
  attendance: MeetingAttendance[];
  roleScores: MeetingRoleScore[];
  studentFeedbacks: StudentMeetingFeedback[];
};

export type MeetingAttendance = {
  id: string;
  meetingId: string;
  studentId: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  notes?: string | null;
  student: Student;
};

export type MeetingRoleScore = {
  id: string;
  meetingId: string;
  roleSlotId: string;
  studentId: string;
  score: number;
  feedback?: string | null;
};

export type StudentMeetingFeedback = {
  id: string;
  meetingId: string;
  studentId: string;
  roleSlotId?: string | null;
  score: number;
  feedback?: string | null;
  scoredByUserId?: string | null;
  scoredAt: string;
};

export type FeedbackReportEntry = {
  id: string;
  studentName: string;
  clubName: string;
  meetingTitle: string;
  meetingDate: string;
  roleName: string;
  score: number;
  feedback?: string | null;
  evaluatorName: string;
  evaluatorRole?: Role | null;
  scoredAt: string;
};

export type MeetingsOverview = {
  meetings: Meeting[];
  roleDefinitions: RoleDefinition[];
  clubs: Club[];
  students: Student[];
};

export type StudentProgress = {
  student: Student & {
    attendance: Array<MeetingAttendance & { meeting: Meeting }>;
    roleSlots: Array<MeetingRoleSlot & { meeting: Meeting }>;
    roleScores: Array<MeetingRoleScore & {
      meeting: Meeting;
      roleSlot: MeetingRoleSlot;
    }>;
  };
  feedback: StudentFeedbackEntry[];
  memberFeedback: MemberFeedbackEntry[];
  requirements: StudentRequirementStatus[];
  summary: {
    bandLevel: string;
    programLevel: string | null;
    clubName: string;
    centreName: string;
    programLevelWarning?: string | null;
    attendanceRate: number | null;
    totalMeetingsMarked: number;
    rolesCompleted: number;
    scoredRoles: number;
    averageScore: number | null;
  };
};

export type StudentFeedbackEntry = {
  id: string;
  meetingDate: string;
  meetingTitle: string;
  clubName: string;
  roleName: string;
  roleNames?: string[];
  score: number;
  feedback?: string | null;
  facilitatorName: string;
  facilitatorRole?: Role | null;
  attendanceStatus?: MeetingAttendance["status"] | null;
  scoredAt: string;
};

export type MemberFeedbackEntry = {
  id: string;
  studentId?: string;
  clubId?: string;
  clubName: string;
  feedback: string;
  facilitatorName: string;
  createdAt: string;
  updatedAt: string;
  canEdit?: boolean;
};

export type StudentClubMember = {
  id?: string;
  displayName: string;
  programLevel?: string | null;
  currentBandLevel: string;
  clubName: string;
};

export type MemberListEntry = {
  id: string;
  userId?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  programLevel?: string | null;
  currentBandLevel: string;
  clubId?: string;
  clubName: string;
  centreId?: string;
  centreName?: string;
  isActive?: boolean;
};

export type MemberDetail = {
  id: string;
  userId?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: Role;
  grade?: string;
  programLevel?: string | null;
  currentBandLevel: string;
  isActive?: boolean;
  clubs: Array<{ id?: string; name: string; centreName?: string; status?: string }>;
  trackingSummary?: {
    currentBand: string;
    completedRequirements: number;
    remainingRequirements: number;
  };
  summary?: {
    rolesCompleted: number;
    averageScore: number | null;
    lastFeedbackDate: string | null;
    attendancePresent: number;
    attendanceTotal: number;
  };
  requirements?: StudentRequirementStatus[];
  attendance?: Array<{
    id: string;
    meetingDate: string;
    meetingTitle: string;
    clubName: string;
    status: string;
    notes?: string | null;
  }>;
  roleHistory?: Array<{
    id: string;
    meetingDate: string;
    meetingTitle: string;
    clubName: string;
    roleName: string;
    attendanceStatus?: MeetingAttendance["status"] | null;
  }>;
  feedback?: Array<{
    id: string;
    meetingDate: string;
    meetingTitle: string;
    clubName: string;
    score: number;
    feedback?: string | null;
    facilitatorName: string;
    roleName: string;
  }>;
  memberFeedback?: MemberFeedbackEntry[];
};

export type BandDocument = {
  id: string;
  title: string;
  description?: string | null;
  fileName: string;
  fileUrl: string;
  programLevel: string;
  bandLevel: string;
  bandOrder: number;
  sessionModule?: string | null;
  clubId?: string | null;
  clubName: string;
  category: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  status: "ACTIVE" | "ARCHIVED" | string;
};

export type Notice = {
  id: string;
  title: string;
  message: string;
  clubId?: string | null;
  clubName: string;
  createdBy: string;
  status: "ACTIVE" | "ARCHIVED" | string;
  expiresAt?: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoticesResponse = {
  notices: Notice[];
  clubs: Club[];
};

export type ResourceCategory = "Role Guide" | "Speech Guide" | "Presentation Guide" | "Video" | "Sample" | "Other";

export type ResourceLink = {
  id: string;
  title: string;
  explanation: string;
  youtubeUrl?: string | null;
  documentUrl?: string | null;
  programLevel?: string | null;
  bandLevel?: string | null;
  bandOrder?: number | null;
  roleKey?: string | null;
  requirementId?: string | null;
  requirementName?: string | null;
  category: ResourceCategory | string;
  status: "ACTIVE" | "ARCHIVED" | string;
  createdAt: string;
  createdBy: string;
  updatedBy?: string | null;
};

export type DocumentsResponse = {
  documents: BandDocument[];
  clubs: Club[];
  studentContext?: {
    programLevel: string | null;
    currentBandLevel: string;
    currentBandOrder: number;
    clubIds: string[];
  } | null;
};

export type ResourcesResponse = {
  resources: ResourceLink[];
  studentContext?: {
    programLevel: string | null;
    currentBandLevel: string;
    currentBandOrder: number | null;
    roleKeys: string[];
    roleResourceKeys: string[];
    requirementIds: string[];
  } | null;
};

export type MembersResponse = {
  members: MemberListEntry[];
  total: number;
  page: number;
  pageSize: number;
  centres: Centre[];
  clubs: Club[];
};

export type BandRequirement = {
  id: string;
  programLevel: string;
  bandLevel: string;
  bandOrder: number;
  name: string;
  description: string;
  requirementType: string;
  targetCount: number;
  sortOrder: number;
  isActive?: boolean;
};

export type StudentRequirementStatus = {
  requirement: BandRequirement;
  currentCount: number;
  isCompleted: boolean;
  completedAt?: string | null;
  notes?: string | null;
  facilitatorSignedOffAt?: string | null;
  facilitatorSignedOffByUserId?: string | null;
  adminOverrideAt?: string | null;
  adminOverrideByUserId?: string | null;
};

export type AdminOverview = {
  centres: Centre[];
  clubs: Club[];
  users: Array<PortalUser & {
    isActive: boolean;
    studentProfile?: {
      id: string;
      grade: string;
      programLevel?: string | null;
      bandLevel: string;
      clubMemberships?: StudentClubMembership[];
    } | null;
  }>;
  students: Student[];
};

export type DemoCleanupSummary = {
  deletedUsers?: number;
  summaries?: Array<Record<string, unknown>>;
  deletedUser?: string;
  deletedRoleScores?: number;
  deletedStudentFeedback?: number;
  deletedAttendance?: number;
  deletedRequirementProgress?: number;
  deletedMemberships?: number;
  deletedParentLinks?: number;
  clearedRoleSlots?: number;
  deletedClubAssignments?: number;
  deletedCentreAssignments?: number;
  demoMeetings?: number;
};

export type DemoCleanupPreview = {
  sampleUsers: number;
  sampleStudents: number;
  demoMeetings: number;
};

const tokenKey = "ileap_member_portal_token";
const authenticationExpiredEvent = "ileap:authentication-expired";
const viteEnvironment = import.meta.env;
const apiBaseUrl = (viteEnvironment?.VITE_API_BASE_URL || "").replace(/\/+$/, "");

function apiUrl(path: string) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

export function getStoredToken() {
  return window.localStorage.getItem(tokenKey);
}

export function storeToken(token: string) {
  window.localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  window.localStorage.removeItem(tokenKey);
}

export function onAuthenticationExpired(listener: () => void) {
  window.addEventListener(authenticationExpiredEvent, listener);

  return () => window.removeEventListener(authenticationExpiredEvent, listener);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    if (response.status === 401 && getStoredToken()) {
      clearToken();
      window.dispatchEvent(new Event(authenticationExpiredEvent));
    }

    throw new Error(responseErrorMessage(data));
  }

  if (data === undefined) {
    throw new Error("The server returned an unreadable response.");
  }

  return data as T;
}

export async function downloadAgenda(meetingId: string) {
  const token = getStoredToken();
  const response = await fetch(apiUrl(`/api/meetings/${meetingId}/agenda.rtf`), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Unable to download agenda.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || "ileap-meeting-agenda.rtf";
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function login(email: string, password: string) {
  const result = await request<unknown>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  return parseLoginResponse(result);
}

export async function getCurrentUser() {
  const result = expectRecord(await request<unknown>("/api/auth/me"), "session");

  if (!isPortalUserResponse(result.user)) {
    throw new Error("The session service returned an invalid user.");
  }

  return { user: result.user };
}

export async function changeMyPassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  return request<{ ok: boolean }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getAdminOverview() {
  return parseAdminOverviewResponse(await request<unknown>("/api/admin/overview"));
}

export async function createCentre(payload: {
  name: string;
  province: string;
  city: string;
  address?: string;
}) {
  return request<{ centre: Centre }>("/api/admin/centres", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function setCentreActive(centreId: string, isActive: boolean) {
  return request<{ centre: Centre }>(`/api/admin/centres/${centreId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

export async function createClub(payload: {
  centreId: string;
  name: string;
  program: string;
}) {
  return request<{ club: Club }>("/api/admin/clubs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function setClubActive(clubId: string, isActive: boolean) {
  return request<{ club: Club }>(`/api/admin/clubs/${clubId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

export async function assignClubFacilitator(clubId: string, facilitatorId: string) {
  return request<{ assignment: ClubFacilitator }>(`/api/admin/clubs/${clubId}/facilitators`, {
    method: "POST",
    body: JSON.stringify({ facilitatorId })
  });
}

export async function removeClubFacilitator(clubId: string, facilitatorId: string) {
  return request<{ ok: boolean }>(`/api/admin/clubs/${clubId}/facilitators/${facilitatorId}`, {
    method: "DELETE"
  });
}

export async function createUser(payload: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  grade?: string;
  programLevel?: string;
  bandLevel?: string;
  clubIds?: string[];
  facilitatorClubIds?: string[];
}) {
  return request<{ user: PortalUser }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateUser(userId: string, payload: {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  grade?: string;
  programLevel?: string;
  bandLevel?: string;
  clubIds?: string[];
  facilitatorClubIds?: string[];
}) {
  return request<{ user: PortalUser & { isActive: boolean } }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function setUserActive(userId: string, isActive: boolean) {
  const path = isActive
    ? `/api/admin/users/${userId}/active`
    : `/api/admin/users/${userId}/deactivate`;

  return request<{ user: PortalUser & { isActive: boolean } }>(path, {
    method: "PATCH",
    ...(isActive ? { body: JSON.stringify({ isActive: true }) } : {})
  });
}

export async function resetUserPassword(userId: string, newPassword: string) {
  return request<{ user: PortalUser & { isActive: boolean } }>(`/api/admin/users/${userId}/password`, {
    method: "PATCH",
    body: JSON.stringify({ newPassword })
  });
}

export async function deleteDemoUser(userId: string) {
  return request<DemoCleanupSummary>(`/api/admin/users/${userId}/demo`, {
    method: "DELETE"
  });
}

export async function getDemoCleanupPreview() {
  return request<{ preview: DemoCleanupPreview }>("/api/admin/demo/cleanup-preview");
}

export async function deleteSampleUsers() {
  return request<DemoCleanupSummary>("/api/admin/demo/delete-sample-users", {
    method: "POST"
  });
}

export async function deleteSampleFeedback() {
  return request<DemoCleanupSummary>("/api/admin/demo/delete-sample-feedback", {
    method: "POST"
  });
}

export async function resetDemoMeetingData() {
  return request<DemoCleanupSummary>("/api/admin/demo/reset-meeting-data", {
    method: "POST"
  });
}

export async function getMeetingsOverview() {
  return parseMeetingsOverviewResponse(await request<unknown>("/api/meetings"));
}

export async function getRoleDefinitions() {
  return request<{ roleDefinitions: RoleDefinition[] }>("/api/meetings/role-definitions");
}

export async function createRoleDefinition(payload: {
  name: string;
  description?: string;
  category?: string;
  programLevel?: string | null;
  level?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return request<{ roleDefinition: RoleDefinition }>("/api/meetings/role-definitions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateRoleDefinition(roleDefinitionId: string, payload: Partial<{
  name: string;
  description: string;
  category: string;
  programLevel: string | null;
  level: string | null;
  sortOrder: number;
  isActive: boolean;
}>) {
  return request<{ roleDefinition: RoleDefinition }>(`/api/meetings/role-definitions/${roleDefinitionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteRoleDefinition(roleDefinitionId: string) {
  return request<{ roleDefinition: RoleDefinition; deleted: boolean; archived: boolean; message?: string }>(`/api/meetings/role-definitions/${roleDefinitionId}`, {
    method: "DELETE"
  });
}

export async function createMeeting(payload: {
  clubId: string;
  title: string;
  templateType?: string;
  meetingDate: string;
  startTime?: string;
  location?: string;
}) {
  return request<{ meeting: Meeting }>("/api/meetings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createBulkMeetings(payload: {
  clubId: string;
  titlePrefix: string;
  templateType: string;
  startDate: string;
  endDate: string;
  dayOfWeek: number;
  startTime: string;
  location?: string;
}) {
  return request<{ meetings: Meeting[] }>("/api/meetings/bulk", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateMeetingDetails(meetingId: string, payload: {
  clubId?: string;
  title?: string;
  templateType?: string;
  meetingDate?: string;
  startTime?: string;
  location?: string;
}) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteMeeting(meetingId: string) {
  return request<{
    deletedMeeting: Pick<Meeting, "id" | "title" | "meetingDate">;
    message: string;
  }>(`/api/meetings/${meetingId}`, {
    method: "DELETE"
  });
}

export async function claimMeetingSlot(meetingId: string, slotId: string) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots/${slotId}/claim`, {
    method: "POST"
  });
}

export async function releaseMeetingSlot(meetingId: string, slotId: string) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots/${slotId}/release`, {
    method: "POST"
  });
}

export async function assignMeetingSlot(meetingId: string, slotId: string, studentId: string | null) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots/${slotId}`, {
    method: "PUT",
    body: JSON.stringify({ studentId })
  });
}

export async function addMeetingRoleSlot(meetingId: string, payload: {
  roleDefinitionId: string;
  slotLabel?: string;
  sortOrder?: number;
}) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function editMeetingRoleSlot(meetingId: string, slotId: string, payload: {
  roleDefinitionId?: string;
  slotLabel?: string;
  sortOrder?: number;
}) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots/${slotId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function removeMeetingRoleSlot(meetingId: string, slotId: string) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots/${slotId}`, {
    method: "DELETE"
  });
}

export async function toggleMeetingLock(meetingId: string) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/lock`, {
    method: "PATCH"
  });
}

export async function markMeetingAttendance(meetingId: string, payload: {
  studentId: string;
  status: MeetingAttendance["status"];
  notes?: string;
}) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/attendance`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function scoreMeetingSlot(meetingId: string, slotId: string, payload: {
  score: number;
  feedback?: string;
}) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots/${slotId}/score`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function saveStudentMeetingFeedback(meetingId: string, payload: {
  studentId: string;
  roleSlotId?: string | null;
  score: number;
  feedback?: string;
}) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/student-feedback`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function getStudentProgress() {
  return parseStudentProgressResponse(await request<unknown>("/api/student/me/progress"));
}

export async function getStudentClubMembers() {
  const result = expectRecord(await request<unknown>("/api/student/me/club-members"), "club members");

  return { members: expectRecordArray(result.members, "club members") as StudentClubMember[] };
}

export async function getMembers(params: {
  centreId?: string;
  clubId?: string;
  search?: string;
  programLevel?: string;
  currentBandLevel?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value)) {
      query.set(key, String(value));
    }
  });

  return parseMembersResponse(await request<unknown>(`/api/members${query.toString() ? `?${query.toString()}` : ""}`));
}

export async function getBandDocuments(params: {
  programLevel?: string;
  bandLevel?: string;
  clubId?: string;
  category?: string;
  search?: string;
  status?: string;
} = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value)) {
      query.set(key, String(value));
    }
  });

  return parseDocumentsResponse(await request<unknown>(`/api/documents${query.toString() ? `?${query.toString()}` : ""}`));
}

export async function createBandDocument(payload: {
  title: string;
  description?: string;
  fileName?: string;
  fileUrl: string;
  programLevel: string;
  bandLevel: string;
  sessionModule?: string;
  clubId?: string | null;
  category?: string;
  status?: string;
}) {
  return request<{ document: BandDocument }>("/api/documents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateBandDocument(documentId: string, payload: Partial<{
  title: string;
  description: string;
  fileName: string;
  fileUrl: string;
  programLevel: string;
  bandLevel: string;
  sessionModule: string;
  clubId: string | null;
  category: string;
  status: string;
}>) {
  return request<{ document: BandDocument }>(`/api/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteBandDocument(documentId: string) {
  return request<{ deletedDocument: BandDocument }>(`/api/documents/${documentId}`, {
    method: "DELETE"
  });
}

export async function getNotices(params: { clubId?: string; status?: string } = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value)) {
      query.set(key, String(value));
    }
  });

  const result = await request<unknown>(`/api/notices${query.toString() ? `?${query.toString()}` : ""}`);
  return parseNoticesResponse(result);
}

function parseNoticesResponse(value: unknown): NoticesResponse {
  if (!isRecord(value) || !Array.isArray(value.notices) || !Array.isArray(value.clubs)) {
    throw new Error("The notices service returned an invalid response.");
  }

  if (!value.notices.every(isNoticeResponse) || !value.clubs.every(isNoticeClubResponse)) {
    throw new Error("The notices service returned an invalid response.");
  }

  return {
    notices: value.notices,
    clubs: value.clubs as Club[]
  };
}

function isNoticeResponse(value: unknown): value is Notice {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.message === "string"
    && (typeof value.clubId === "string" || value.clubId === null || value.clubId === undefined)
    && typeof value.clubName === "string"
    && typeof value.createdBy === "string"
    && typeof value.status === "string"
    && (typeof value.expiresAt === "string" || value.expiresAt === null || value.expiresAt === undefined)
    && typeof value.isPinned === "boolean"
    && isValidDateString(value.createdAt)
    && isValidDateString(value.updatedAt)
    && (value.expiresAt == null || isValidDateString(value.expiresAt));
}

function isNoticeClubResponse(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function responseErrorMessage(value: unknown) {
  return isRecord(value) && typeof value.message === "string" && value.message.trim()
    ? value.message
    : "Request failed.";
}

function expectRecord(value: unknown, service: string) {
  if (!isRecord(value)) {
    throw new Error(`The ${service} service returned an invalid response.`);
  }

  return value;
}

function expectRecordArray(value: unknown, service: string) {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`The ${service} service returned an invalid response.`);
  }

  return value;
}

function isPortalRole(value: unknown): value is Role {
  return value === "ADMIN" || value === "FACILITATOR" || value === "STUDENT";
}

function isPortalUserResponse(value: unknown): value is PortalUser {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.email === "string"
    && typeof value.firstName === "string"
    && typeof value.lastName === "string"
    && isPortalRole(value.role);
}

function parseLoginResponse(value: unknown): LoginResponse {
  const result = expectRecord(value, "login");

  if (typeof result.token !== "string" || !result.token || !isPortalUserResponse(result.user)) {
    throw new Error("The login service returned an invalid response.");
  }

  return { token: result.token, user: result.user };
}

export function parseMeetingsOverviewResponse(value: unknown): MeetingsOverview {
  const result = expectRecord(value, "meetings");
  const meetings = expectRecordArray(result.meetings, "meetings");
  const roleDefinitions = expectRecordArray(result.roleDefinitions, "meetings");
  const clubs = expectRecordArray(result.clubs, "meetings");
  const students = expectRecordArray(result.students, "meetings");

  if (!meetings.every(isMeetingResponse)
    || !clubs.every(isClubResponse)
    || !students.every(isStudentResponse)) {
    throw new Error("The meetings service returned an invalid response.");
  }

  return {
    meetings,
    roleDefinitions: roleDefinitions as RoleDefinition[],
    clubs,
    students
  };
}

function isMeetingResponse(value: Record<string, unknown>): value is Meeting {
  return typeof value.id === "string"
    && typeof value.clubId === "string"
    && typeof value.title === "string"
    && typeof value.templateType === "string"
    && isValidDateString(value.meetingDate)
    && typeof value.startTime === "string"
    && typeof value.isRoleLocked === "boolean"
    && isClubResponse(value.club)
    && Array.isArray(value.roleSlots)
    && value.roleSlots.every((slot) => isRecord(slot) && isRecord(slot.roleDefinition))
    && Array.isArray(value.attendance)
    && Array.isArray(value.roleScores)
    && Array.isArray(value.studentFeedbacks);
}

function isClubResponse(value: unknown): value is Club {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.program === "string"
    && typeof value.isActive === "boolean";
}

function isStudentResponse(value: unknown): value is Student {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.bandLevel === "string"
    && isPortalUserResponse(value.user);
}

function parseAdminOverviewResponse(value: unknown): AdminOverview {
  const result = expectRecord(value, "administration");

  return {
    centres: expectRecordArray(result.centres, "administration") as Centre[],
    clubs: expectRecordArray(result.clubs, "administration") as Club[],
    users: expectRecordArray(result.users, "administration") as AdminOverview["users"],
    students: expectRecordArray(result.students, "administration") as Student[]
  };
}

function parseMembersResponse(value: unknown): MembersResponse {
  const result = expectRecord(value, "members");

  if (typeof result.total !== "number" || typeof result.page !== "number" || typeof result.pageSize !== "number") {
    throw new Error("The members service returned an invalid response.");
  }

  return {
    members: expectRecordArray(result.members, "members") as MemberListEntry[],
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    centres: expectRecordArray(result.centres, "members") as Centre[],
    clubs: expectRecordArray(result.clubs, "members") as Club[]
  };
}

function parseDocumentsResponse(value: unknown): DocumentsResponse {
  const result = expectRecord(value, "documents");

  return {
    documents: expectRecordArray(result.documents, "documents") as BandDocument[],
    clubs: expectRecordArray(result.clubs, "documents") as Club[],
    studentContext: isRecord(result.studentContext)
      ? result.studentContext as DocumentsResponse["studentContext"]
      : null
  };
}

function parseResourcesResponse(value: unknown): ResourcesResponse {
  const result = expectRecord(value, "resources");

  return {
    resources: expectRecordArray(result.resources, "resources") as ResourceLink[],
    studentContext: isRecord(result.studentContext)
      ? result.studentContext as ResourcesResponse["studentContext"]
      : null
  };
}

export function parseStudentProgressResponse(value: unknown): StudentProgress {
  const result = expectRecord(value, "student progress");
  const student = expectRecord(result.student, "student progress");
  const summary = expectRecord(result.summary, "student progress");

  if (!isPortalUserResponse(student.user)
    || typeof summary.bandLevel !== "string") {
    throw new Error("The student progress service returned an invalid response.");
  }

  return {
    student: student as StudentProgress["student"],
    feedback: expectRecordArray(result.feedback, "student progress") as StudentFeedbackEntry[],
    memberFeedback: Array.isArray(result.memberFeedback) ? result.memberFeedback as MemberFeedbackEntry[] : [],
    requirements: expectRecordArray(result.requirements, "student progress") as StudentRequirementStatus[],
    summary: summary as StudentProgress["summary"]
  };
}

export async function createNotice(payload: {
  title: string;
  message: string;
  clubId?: string | null;
  expiresAt?: string | null;
  isPinned?: boolean;
  status?: string;
}) {
  return request<{ notice: Notice }>("/api/notices", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateNotice(noticeId: string, payload: Partial<{
  title: string;
  message: string;
  clubId: string | null;
  expiresAt: string | null;
  isPinned: boolean;
  status: string;
}>) {
  return request<{ notice: Notice }>(`/api/notices/${noticeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteNotice(noticeId: string) {
  return request<{ deletedNotice: Notice }>(`/api/notices/${noticeId}`, {
    method: "DELETE"
  });
}

export async function getResourceLinks(params: {
  roleKey?: string;
  requirementId?: string;
  category?: string;
  search?: string;
  status?: string;
} = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value)) {
      query.set(key, String(value));
    }
  });

  return parseResourcesResponse(await request<unknown>(`/api/resources${query.toString() ? `?${query.toString()}` : ""}`));
}

export async function createResourceLink(payload: {
  title: string;
  explanation: string;
  youtubeUrl?: string;
  documentUrl?: string;
  programLevel?: string | null;
  bandLevel?: string | null;
  roleKey?: string | null;
  requirementId?: string | null;
  category: string;
  status?: string;
}) {
  return request<{ resource: ResourceLink }>("/api/resources", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateResourceLink(resourceId: string, payload: Partial<{
  title: string;
  explanation: string;
  youtubeUrl: string;
  documentUrl: string;
  programLevel: string | null;
  bandLevel: string | null;
  roleKey: string | null;
  requirementId: string | null;
  category: string;
  status: string;
}>) {
  return request<{ resource: ResourceLink }>(`/api/resources/${resourceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteResourceLink(resourceId: string) {
  return request<{ deletedResource: ResourceLink }>(`/api/resources/${resourceId}`, {
    method: "DELETE"
  });
}

export async function getMemberDetail(studentId: string) {
  return request<{ member: MemberDetail }>(`/api/members/${studentId}`);
}

export async function createMemberFeedback(studentId: string, payload: { clubId: string; feedback: string }) {
  return request<{ feedback: MemberFeedbackEntry }>(`/api/members/${studentId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateMemberFeedback(studentId: string, feedbackId: string, payload: { feedback: string }) {
  return request<{ feedback: MemberFeedbackEntry }>(`/api/members/${studentId}/feedback/${feedbackId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteMemberFeedback(studentId: string, feedbackId: string) {
  return request<{ deletedFeedback: { id: string } }>(`/api/members/${studentId}/feedback/${feedbackId}`, {
    method: "DELETE"
  });
}

export async function createMember(payload: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  grade?: string;
  programLevel?: string;
  bandLevel?: string;
  clubIds: string[];
}) {
  return request<{ user: PortalUser & { isActive: boolean } }>("/api/members", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateMember(studentId: string, payload: {
  programLevel: string;
  bandLevel: string;
}) {
  return request<{ user: PortalUser & { isActive: boolean } }>(`/api/members/${studentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function permanentlyDeleteMember(studentId: string) {
  return request<{
    deletedMember: {
      id: string;
      userId: string;
      displayName: string;
      email: string;
    };
    deletionSummary: {
      deletedRoleScores: number;
      deletedMeetingFeedback: number;
      deletedMemberFeedback: number;
      deletedAttendance: number;
      deletedRequirementProgress: number;
      deletedClubMemberships: number;
      deletedParentLinks: number;
      clearedAssignedRoleSlots: number;
      deletedUploadedDocuments: number;
      deletedCreatedResourceLinks: number;
    };
  }>(`/api/members/${studentId}`, {
    method: "DELETE"
  });
}

export async function fetchStudentProgressForManager(studentId: string) {
  return parseStudentProgressResponse(await request<unknown>(`/api/student/${studentId}/progress`));
}

export async function updateStudentProfile(studentId: string, payload: {
  programLevel: string;
  bandLevel: string;
}) {
  return request<StudentProgress>(`/api/student/${studentId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function updateStudentRequirement(studentId: string, requirementId: string, payload: {
  currentCount: number;
  isCompleted?: boolean;
  notes?: string;
}) {
  return request<{ progress: StudentRequirementStatus }>(`/api/student/${studentId}/requirements/${requirementId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function backfillPreviousBandRequirements(studentId: string) {
  return request<{ updatedCount: number }>(`/api/student/${studentId}/requirements/backfill`, {
    method: "POST"
  });
}

export async function getBandRequirements() {
  const result = expectRecord(await request<unknown>("/api/student/requirements"), "band requirements");

  return { requirements: expectRecordArray(result.requirements, "band requirements") as BandRequirement[] };
}

export async function createBandRequirement(payload: {
  programLevel: string;
  bandLevel: string;
  name: string;
  description: string;
  requirementType: string;
  targetCount: number;
  sortOrder: number;
  isActive?: boolean;
}) {
  return request<{ requirement: BandRequirement }>("/api/student/requirements", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateBandRequirement(requirementId: string, payload: Partial<{
  programLevel: string;
  bandLevel: string;
  name: string;
  description: string;
  requirementType: string;
  targetCount: number;
  sortOrder: number;
  isActive: boolean;
}>) {
  return request<{ requirement: BandRequirement }>(`/api/student/requirements/${requirementId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteBandRequirement(requirementId: string) {
  return request<{ requirement: BandRequirement; deleted: boolean; archived: boolean; message?: string }>(`/api/student/requirements/${requirementId}`, {
    method: "DELETE"
  });
}

export async function getFeedbackReport() {
  const result = expectRecord(await request<unknown>("/api/reports/facilitator-feedback"), "feedback");

  return { feedback: expectRecordArray(result.feedback, "feedback") as FeedbackReportEntry[] };
}
