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
  score: number;
  feedback?: string | null;
  facilitatorName: string;
  facilitatorRole?: Role | null;
  attendanceStatus?: MeetingAttendance["status"] | null;
  scoredAt: string;
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

const tokenKey = "ileap_member_portal_token";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

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
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
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
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function getCurrentUser() {
  return request<{ user: PortalUser }>("/api/auth/me");
}

export async function getAdminOverview() {
  return request<AdminOverview>("/api/admin/overview");
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
  return request<{ user: PortalUser & { isActive: boolean } }>(`/api/admin/users/${userId}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

export async function getMeetingsOverview() {
  return request<MeetingsOverview>("/api/meetings");
}

export async function createMeeting(payload: {
  clubId: string;
  title: string;
  templateType: string;
  meetingDate: string;
  startTime: string;
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

export async function claimMeetingSlot(meetingId: string, slotId: string) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/slots/${slotId}/claim`, {
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

export async function getStudentProgress() {
  return request<StudentProgress>("/api/student/me/progress");
}

export async function fetchStudentProgressForManager(studentId: string) {
  return request<StudentProgress>(`/api/student/${studentId}/progress`);
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

export async function getFeedbackReport() {
  return request<{ feedback: FeedbackReportEntry[] }>("/api/reports/facilitator-feedback");
}
