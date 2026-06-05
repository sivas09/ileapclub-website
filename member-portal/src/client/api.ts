export type Role = "ADMIN" | "FACILITATOR" | "PARENT" | "STUDENT";

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
  bandLevel: string;
  user: PortalUser;
  clubMemberships?: StudentClubMembership[];
  parents?: StudentParent[];
};

export type StudentClubMembership = {
  id: string;
  studentId: string;
  clubId: string;
  status: string;
  club: Club;
};

export type StudentParent = {
  id: string;
  parent: PortalUser;
};

export type ClubFacilitator = {
  id: string;
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
  requirements: StudentRequirementStatus[];
  summary: {
    bandLevel: string;
    clubName: string;
    centreName: string;
    attendanceRate: number | null;
    totalMeetingsMarked: number;
    rolesCompleted: number;
    scoredRoles: number;
    averageScore: number | null;
  };
};

export type BandRequirement = {
  id: string;
  bandLevel: string;
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
};

export type AdminOverview = {
  centres: Centre[];
  clubs: Club[];
  users: Array<PortalUser & {
    isActive: boolean;
    studentProfile?: {
      id: string;
      grade: string;
      bandLevel: string;
      clubMemberships?: StudentClubMembership[];
    } | null;
  }>;
  students: Student[];
};

const tokenKey = "ileap_member_portal_token";

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
  const response = await fetch(path, {
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
  const response = await fetch(`/api/meetings/${meetingId}/agenda.rtf`, {
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

export async function createUser(payload: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  grade?: string;
  clubIds?: string[];
  parentIds?: string[];
  facilitatorClubIds?: string[];
}) {
  return request<{ user: PortalUser }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
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
  roleDefinitionIds: string[];
}) {
  return request<{ meeting: Meeting }>("/api/meetings", {
    method: "POST",
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
