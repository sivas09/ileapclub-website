export const programLevels = ["JUNIOR", "SENIOR"] as const;

export type ProgramLevel = typeof programLevels[number];

export const bandLevels = [
  "White",
  "Yellow",
  "Orange I",
  "Orange II",
  "Green I",
  "Green II",
  "Blue I",
  "Blue II",
  "Red I",
  "Red II",
  "Brown I",
  "Brown II",
  "Black I",
  "Black II"
] as const;

export const documentCategories = [
  "Band Requirements",
  "Session Materials",
  "Case Studies",
  "Worksheets",
  "Speech Guides",
  "Role Guides",
  "Tips / Reference",
  "Speech Guide",
  "Presentation Guide",
  "Worksheet",
  "Rubric",
  "Sample",
  "Training Material",
  "Other"
] as const;

export const resourceCategories = [
  "Role Guide",
  "Speech Guide",
  "Presentation Guide",
  "Report Guide",
  "Video",
  "Document",
  "Sample",
  "Other"
] as const;

export const noticeStatuses = ["ACTIVE", "ARCHIVED"] as const;

export const noticeLimits = {
  title: 120,
  message: 2000
} as const;

export const leadershipRoleKeys = ["ichair", "igrammarian", "ifinesmaster", "ifillercounter", "itimer"] as const;

export const mainReportRolePairs = [
  ["iChair", "iChair Report"],
  ["iGrammarian", "iGrammarian Report"],
  ["iFiller Counter", "iFiller Counter Report"],
  ["iFinesMaster", "iFinesMaster Report"],
  ["iTimer", "iTimer Report"]
] as const;

export function reportRoleNameForMainRole(roleName: string) {
  const normalizedRoleName = normalizePairedRoleName(roleName);
  return mainReportRolePairs.find(([mainRole]) => normalizePairedRoleName(mainRole) === normalizedRoleName)?.[1] ?? null;
}

export function mainRoleNameForReportRole(roleName: string) {
  const normalizedRoleName = normalizePairedRoleName(roleName);
  return mainReportRolePairs.find(([, reportRole]) => normalizePairedRoleName(reportRole) === normalizedRoleName)?.[0] ?? null;
}

export function isReportRoleName(roleName: string) {
  return mainRoleNameForReportRole(roleName) !== null;
}

function normalizePairedRoleName(roleName: string) {
  return roleName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
