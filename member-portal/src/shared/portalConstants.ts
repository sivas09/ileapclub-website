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
