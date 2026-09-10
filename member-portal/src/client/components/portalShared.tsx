import type { ReactNode } from "react";
import type { BandDocument, Meeting, MeetingsOverview, MemberDetail, ResourceLink, Role, RoleDefinition } from "../api";
import {
  bandLevels,
  documentCategories,
  isReportRoleName,
  leadershipRoleKeys,
  programLevels,
  resourceCategories
} from "../../shared/portalConstants";

export const programLevelOptions = programLevels.map((value) => ({
  value,
  label: value === "JUNIOR" ? "Junior" : "Senior"
}));
export const bandLevelOptions = bandLevels;
export const documentCategoryOptions = documentCategories;
export const resourceCategoryOptions = resourceCategories;
const leadershipRoleKeySet = new Set<string>(leadershipRoleKeys);

export type OverviewLink = {
  href: string;
  label: string;
  description: string;
};

export const portalNavigationItems: Record<Role, Array<{ href: string; label: string }>> = {
  ADMIN: [
    { href: "#overview", label: "Overview" },
    { href: "#admin", label: "Setup" },
    { href: "#members", label: "Members" },
    { href: "#notices", label: "Notices" },
    { href: "#documents", label: "Documents" },
    { href: "#meetings", label: "Meetings" },
    { href: "#teaching-modules", label: "Teaching Modules" },
    { href: "#feedback", label: "Feedback" },
    { href: "#requirements", label: "Band Progress" }
  ],
  CENTER_DIRECTOR: [
    { href: "#overview", label: "Overview" },
    { href: "#admin", label: "Setup" },
    { href: "#members", label: "Members" },
    { href: "#notices", label: "Notices" },
    { href: "#documents", label: "Documents" },
    { href: "#meetings", label: "Meetings" },
    { href: "#teaching-modules", label: "Teaching Modules" },
    { href: "#feedback", label: "Feedback" },
    { href: "#requirements", label: "Band Progress" }
  ],
  FACILITATOR: [
    { href: "#overview", label: "Overview" },
    { href: "#members", label: "Members" },
    { href: "#notices", label: "Notices" },
    { href: "#documents", label: "Documents" },
    { href: "#meetings", label: "Meetings" },
    { href: "#teaching-modules", label: "Teaching Modules" },
    { href: "#feedback", label: "Feedback" },
    { href: "#requirements", label: "Band Progress" }
  ],
  STUDENT: [
    { href: "#overview", label: "Overview" },
    { href: "#notices", label: "Notices" },
    { href: "#meetings", label: "Meetings" },
    { href: "#club-members", label: "My Club" },
    { href: "#resources", label: "Resources" },
    { href: "#progress", label: "My Progress" }
  ]
};

export function sectionHrefForHash(role: Role, hash: string) {
  const hashRoot = hash.split("/")[0] || "#overview";
  const normalizedHash = hashRoot === "#resource-links" || hashRoot === "#resources"
    ? role === "STUDENT" ? "#resources" : "#documents"
    : hashRoot;

  return portalNavigationItems[role].some((item) => item.href === normalizedHash) ? normalizedHash : "#overview";
}

const overviewLinks: Record<Role, OverviewLink[]> = {
  ADMIN: [
    { href: "#admin", label: "Setup", description: "Centres, clubs, and portal setup" },
    { href: "#members", label: "Members", description: "Member accounts and club access" },
    { href: "#meetings", label: "Meetings", description: "Schedules, agendas, roles, and attendance" },
    { href: "#teaching-modules", label: "Teaching Modules", description: "Current module for each club" },
    { href: "#documents", label: "Documents", description: "Band documents and learning resources" },
    { href: "#feedback", label: "Feedback", description: "Scores and facilitator feedback" },
    { href: "#requirements", label: "Band Progress", description: "Requirements and member advancement" }
  ],
  CENTER_DIRECTOR: [
    { href: "#admin", label: "Setup", description: "Centres, clubs, and operational setup" },
    { href: "#members", label: "Members", description: "Member accounts and club access" },
    { href: "#meetings", label: "Meetings", description: "Schedules, agendas, roles, and attendance" },
    { href: "#teaching-modules", label: "Teaching Modules", description: "Current module for each club" },
    { href: "#documents", label: "Documents", description: "Band documents and learning resources" },
    { href: "#feedback", label: "Feedback", description: "Scores and facilitator feedback" },
    { href: "#requirements", label: "Band Progress", description: "Requirements and member advancement" }
  ],
  FACILITATOR: [
    { href: "#members", label: "Members", description: "Members in your assigned clubs" },
    { href: "#meetings", label: "Meetings", description: "Schedules, agendas, roles, and attendance" },
    { href: "#teaching-modules", label: "Teaching Modules", description: "Open each club's current module" },
    { href: "#documents", label: "Documents", description: "Band documents and learning resources" },
    { href: "#feedback", label: "Feedback", description: "Scores and member feedback" },
    { href: "#requirements", label: "Band Progress", description: "Requirements and member advancement" }
  ],
  STUDENT: [
    { href: "#club-members", label: "My Club", description: "Members in your club" },
    { href: "#meetings", label: "Meetings", description: "Upcoming meetings, agendas, and role booking" },
    { href: "#progress", label: "My Progress", description: "Band requirements, scores, and feedback" },
    { href: "#resources", label: "Resources", description: "Band materials and role guides" }
  ]
};

export function overviewLinksForRole(role: Role) {
  return overviewLinks[role];
}

export const resourceGroupLabels = [
  "Leadership Roles",
  "Support Roles",
  "Speaking Roles",
  "Evaluator Roles",
  "Speech Guides",
  "Presentation Guides",
  "Band Resources",
  "Other"
] as const;

export type ResourceGroupLabel = typeof resourceGroupLabels[number];

export function resourceGroupFor(resource: ResourceLink): ResourceGroupLabel {
  const category = normalizeResourceKey(resource.category);
  const descriptor = normalizeResourceKey([
    resource.roleKey,
    resource.title,
    resource.requirementName
  ].filter(Boolean).join(" "));

  if (category.includes("speech guide")) {
    return "Speech Guides";
  }

  if (category.includes("presentation guide")) {
    return "Presentation Guides";
  }

  if (resource.bandLevel || resource.requirementId || resource.requirementName) {
    return "Band Resources";
  }

  if (descriptor.includes("evaluator") || descriptor.includes("evaluation")) {
    return "Evaluator Roles";
  }

  const compactDescriptor = descriptor.replace(/\s+/g, "");
  if (leadershipRoleKeys.some((roleKey) => compactDescriptor.includes(roleKey))) {
    return "Leadership Roles";
  }

  if (["prepared speech", "speaker", "story", "joke", "think on feet", "table topic"].some((term) => descriptor.includes(term))) {
    return "Speaking Roles";
  }

  if (resource.roleKey || category.includes("role guide") || category.includes("report guide")) {
    return "Support Roles";
  }

  return "Other";
}

export function groupResourceLinks(resources: ResourceLink[]) {
  return resourceGroupLabels
    .map((label) => ({
      label,
      resources: resources.filter((resource) => resourceGroupFor(resource) === label)
    }))
    .filter((group) => group.resources.length > 0);
}

export function HelpLabel({
  label,
  resources,
  onSelectResource
}: {
  label: string;
  resources: ResourceLink[];
  onSelectResource: (resource: ResourceLink) => void;
}) {
  const firstResource = resources[0];

  return (
    <span className="help-label">
      <span>{label}</span>
      {firstResource ? (
        <button
          type="button"
          className="help-icon"
          title={firstResource.explanation}
          aria-label={`Open help for ${label}`}
          onClick={() => onSelectResource(firstResource)}
        >
          i
        </button>
      ) : null}
    </span>
  );
}

export type MissingRequirementGuide = {
  title: string;
  programLevel?: string | null;
  bandLevel?: string | null;
  requirementName: string;
};

export type RequirementGuide = ResourceLink | BandDocument;

export type BandGuideTarget = {
  programLevel?: string | null;
  bandLevel?: string | null;
};

export type RequirementGuideTarget = {
  id: string;
  name: string;
  programLevel: string;
  bandLevel: string;
};

export function ResourcePanel({
  resource,
  document = null,
  missingGuide = null,
  onClose
}: {
  resource: ResourceLink | null;
  document?: BandDocument | null;
  missingGuide?: MissingRequirementGuide | null;
  onClose: () => void;
}) {
  if (!resource && !document && !missingGuide) {
    return null;
  }

  const documentUrl = document ? documentLink(document) : "";

  return (
    <div className="resource-panel-backdrop" role="presentation" onClick={onClose}>
      <section className="resource-panel" role="dialog" aria-modal="true" aria-labelledby="resource-panel-title" onClick={(event) => event.stopPropagation()}>
        <div className="resource-panel-header">
          <div>
            <p className="eyebrow">{resource?.category ?? document?.category ?? "Requirement Guide"}</p>
            <h3 id="resource-panel-title">{resource?.title ?? document?.title ?? missingGuide?.title}</h3>
          </div>
          <button type="button" aria-label="Close help panel" onClick={onClose}>Close</button>
        </div>
        <p>{resource?.explanation ?? document?.description ?? (document ? "Guide exists, but no description has been added yet." : "Guide link has not been added yet.")}</p>
        <dl className="document-meta">
          <div><dt>Role</dt><dd>{resource?.roleKey || "Any"}</dd></div>
          <div><dt>Program</dt><dd>{formatProgramLevel(resource?.programLevel ?? document?.programLevel ?? missingGuide?.programLevel)}</dd></div>
          <div><dt>Band</dt><dd>{resource?.bandLevel || document?.bandLevel || missingGuide?.bandLevel || "Any"}</dd></div>
          <div><dt>Requirement</dt><dd>{resource?.requirementName || missingGuide?.requirementName || "Any"}</dd></div>
        </dl>
        {resource
          ? <ResourceActions resource={resource} />
          : document
            ? (
              <div className="document-actions">
                {documentUrl
                  ? <a href={documentUrl} target="_blank" rel="noreferrer">Open / Download</a>
                  : <span className="document-disabled-action">Guide exists, but no link has been added yet.</span>}
              </div>
            )
            : <div className="document-actions"><span className="document-disabled-action">Links not added yet</span></div>}
      </section>
    </div>
  );
}

export function ResourceActions({ resource }: { resource: ResourceLink }) {
  return (
    <div className="document-actions">
      {resource.youtubeUrl
        ? <a href={resource.youtubeUrl} target="_blank" rel="noreferrer">Open YouTube</a>
        : null}
      {resource.documentUrl
        ? <a href={resource.documentUrl} target="_blank" rel="noreferrer">Open Document</a>
        : null}
      {!resource.youtubeUrl && !resource.documentUrl ? <span className="document-disabled-action">Links not added yet</span> : null}
    </div>
  );
}

export function SummaryTile({ label, value, valueText }: { label: string; value?: number; valueText?: string }) {
  return (
    <article className="summary-tile">
      <span>{label}</span>
      <strong>{valueText ?? value ?? 0}</strong>
    </article>
  );
}

export function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="data-panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export function StatusBadge({ isActive }: { isActive: boolean }) {
  return <em className={isActive ? "status-badge is-active" : "status-badge is-inactive"}>{isActive ? "Active" : "Archived"}</em>;
}

export function isDemoUser(user: { id: string; email: string; firstName: string; lastName: string; role: Role }, currentUserId: string) {
  if (user.id === currentUserId || user.role === "ADMIN" || user.role === "CENTER_DIRECTOR") {
    return false;
  }

  const marker = `${user.email} ${user.firstName} ${user.lastName}`.toLowerCase();

  return marker.includes("example.com") || marker.includes("sample");
}

export function formatCleanupSummary(prefix: string, result: unknown) {
  if (!result || typeof result !== "object") {
    return prefix;
  }

  const entries = Object.entries(result)
    .filter(([, value]) => typeof value === "number" || typeof value === "string")
    .map(([key, value]) => `${formatSummaryKey(key)}: ${value}`);

  return entries.length ? `${prefix} ${entries.join(", ")}.` : prefix;
}

export function formatSummaryKey(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function roleSlotName(slot: Meeting["roleSlots"][number]) {
  return slot.slotLabel || slot.roleDefinition.name;
}

export function resourcesForRole(resources: ResourceLink[], slot: Meeting["roleSlots"][number]) {
  return resourcesForRoleName(resources, roleSlotName(slot), slot.roleDefinition.name);
}

export function resourcesForRoleName(resources: ResourceLink[], roleName: string, definitionName = roleName) {
  const normalizedRoleName = normalizeResourceKey(roleName);
  const normalizedDefinitionName = normalizeResourceKey(definitionName);

  return resources.filter((resource) => {
    if (!resource.roleKey) {
      return false;
    }

    const resourceKey = normalizeResourceKey(resource.roleKey);

    return normalizedRoleName === resourceKey
      || normalizedDefinitionName === resourceKey
      || normalizedRoleName.startsWith(`${resourceKey} `)
      || normalizedDefinitionName.startsWith(`${resourceKey} `);
  });
}

export function resourcesForRequirement(resources: ResourceLink[], requirementId: string, requirementName: string) {
  const normalizedRequirementName = normalizeResourceKey(requirementName);

  return resources.filter((resource) => {
    if (resource.requirementId === requirementId) {
      return true;
    }

    if (!resource.requirementName && !resource.title) {
      return false;
    }

    return normalizeResourceKey(resource.requirementName ?? resource.title).includes(normalizedRequirementName)
      || normalizedRequirementName.includes(normalizeResourceKey(resource.requirementName ?? resource.title));
  });
}

export function documentsForRequirement(documents: BandDocument[], requirement: RequirementGuideTarget) {
  const normalizedRequirementName = normalizeResourceKey(requirement.name);
  const eligibleDocuments = documents.filter((document) => (
    document.status === "ACTIVE"
    && normalizeProgramLevel(document.programLevel) === normalizeProgramLevel(requirement.programLevel)
    && normalizeResourceKey(document.bandLevel) === normalizeResourceKey(requirement.bandLevel)
  ));
  const manuallyLinkedDocuments = eligibleDocuments.filter((document) => document.requirementId === requirement.id);
  const titleMatchedDocuments = eligibleDocuments.filter((document) => (
    !document.requirementId
    && normalizeResourceKey(document.title).includes(normalizedRequirementName)
  ));

  return [...manuallyLinkedDocuments, ...titleMatchedDocuments];
}

export function requirementGuideFor(
  resources: ResourceLink[],
  documents: BandDocument[],
  requirement: RequirementGuideTarget
): RequirementGuide | null {
  const matchingDocuments = documentsForRequirement(documents, requirement);
  const manuallyLinkedDocument = matchingDocuments.find((document) => document.requirementId === requirement.id);
  const matchingResource = resourcesForRequirement(resources, requirement.id, requirement.name)
    .find((resource) => (
      resource.status === "ACTIVE"
      && (resource.requirementId === requirement.id
        ? (!resource.programLevel || normalizeProgramLevel(resource.programLevel) === normalizeProgramLevel(requirement.programLevel))
          && (!resource.bandLevel || normalizeResourceKey(resource.bandLevel) === normalizeResourceKey(requirement.bandLevel))
        : Boolean(
          resource.programLevel
          && resource.bandLevel
          && normalizeProgramLevel(resource.programLevel) === normalizeProgramLevel(requirement.programLevel)
          && normalizeResourceKey(resource.bandLevel) === normalizeResourceKey(requirement.bandLevel)
        ))
    ));

  return manuallyLinkedDocument ?? matchingResource ?? matchingDocuments[0] ?? null;
}

export function bandGuideFor(
  resources: ResourceLink[],
  documents: BandDocument[],
  target: BandGuideTarget
): RequirementGuide | null {
  const programLevel = target.programLevel === "JUNIOR" || target.programLevel === "SENIOR"
    ? target.programLevel
    : null;
  const bandLevel = normalizeBandLevel(target.bandLevel);

  if (!programLevel || !bandLevel) {
    return null;
  }

  const matchesBand = (item: ResourceLink | BandDocument) => (
    item.status === "ACTIVE"
    && !item.requirementId
    && (!("roleKey" in item) || !item.roleKey)
    && item.programLevel === programLevel
    && normalizeBandLevel(item.bandLevel) === bandLevel
    && !documentProgramTitleWarning(item.title, item.programLevel)
  );
  const categoryPriority = (item: ResourceLink | BandDocument) => {
    const category = normalizeResourceKey(item.category);

    if (category === "band guide") return 0;
    if (category === "band requirements") return 1;
    return 2;
  };
  const matchingGuides = [...documents, ...resources]
    .filter(matchesBand)
    .sort((left, right) => categoryPriority(left) - categoryPriority(right));

  return matchingGuides[0] ?? null;
}

export function documentProgramTitleWarning(title: string, programLevel: string | null | undefined) {
  const titleProgram = title.match(/^\s*(junior|senior)\b/i)?.[1]?.toUpperCase();

  if (titleProgram === "JUNIOR" && programLevel === "SENIOR") {
    return "This document title says Junior but the selected program is Senior.";
  }

  if (titleProgram === "SENIOR" && programLevel === "JUNIOR") {
    return "This document title says Senior but the selected program is Junior.";
  }

  return "";
}

export function roleDefinitionsForMeeting(roleDefinitions: RoleDefinition[], meeting: Meeting) {
  const programLevel = normalizeProgramLevel(meeting.club.program);

  return roleDefinitions.filter((roleDefinition) => (
    roleDefinition.isActive
    && (!roleDefinition.programLevel || roleDefinition.programLevel === programLevel)
  ));
}

export function roleDefinitionsForSlot(roleDefinitions: RoleDefinition[], slot: Meeting["roleSlots"][number]) {
  if (roleDefinitions.some((roleDefinition) => roleDefinition.id === slot.roleDefinition.id)) {
    return roleDefinitions;
  }

  return [...roleDefinitions, slot.roleDefinition];
}

export function isLeadershipMeetingRole(slot: Meeting["roleSlots"][number]) {
  return isLeadershipRoleName(slot.slotLabel || "") || isLeadershipRoleName(slot.roleDefinition.name);
}

export function isReportMeetingRole(slot: Meeting["roleSlots"][number]) {
  return isReportRoleName(slot.slotLabel || "") || isReportRoleName(slot.roleDefinition.name);
}

export function claimableMeetingRoleSlots(meeting: Pick<Meeting, "roleSlots">) {
  return meeting.roleSlots.filter((slot) => !isReportMeetingRole(slot));
}

export function isLeadershipRoleName(roleName: string) {
  return leadershipRoleKeySet.has(normalizeLeadershipRoleName(roleName));
}

function normalizeLeadershipRoleName(roleName: string) {
  return roleName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeProgramLevel(program: string | null | undefined) {
  const normalizedProgram = (program ?? "").trim().toLowerCase();

  if (normalizedProgram === "junior" || normalizedProgram.includes("junior")) {
    return "JUNIOR";
  }

  if (normalizedProgram === "senior" || normalizedProgram.includes("senior")) {
    return "SENIOR";
  }

  return null;
}

export function normalizeResourceKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+\d+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizeBandLevel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function formatStudentName(student: { user: { firstName: string; lastName: string } }) {
  return `${student.user.firstName} ${student.user.lastName}`;
}

export function splitDisplayName(member: Pick<MemberDetail, "displayName" | "firstName" | "lastName"> | null) {
  if (member?.firstName || member?.lastName) {
    return {
      firstName: member.firstName ?? "",
      lastName: member.lastName ?? ""
    };
  }

  const parts = (member?.displayName ?? "").trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ")
  };
}

export function dateInputValue(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function formatProgramLevel(programLevel?: string | null) {
  if (programLevel === "JUNIOR") {
    return "Junior";
  }

  if (programLevel === "SENIOR") {
    return "Senior";
  }

  return "Not set";
}

export function formatResourceScope(resource: ResourceLink) {
  const program = formatProgramLevel(resource.programLevel);
  const band = resource.bandLevel || "Any band";

  return `${program} / ${band}`;
}

export function resourceIdFromHash() {
  const match = window.location.hash.match(/^#resources\/([^/?#]+)$/);

  return match ? decodeURIComponent(match[1]) : null;
}

export function formatBandLadder(programLevel?: string | null) {
  if (programLevel === "JUNIOR") {
    return "Junior 14-Band";
  }

  if (programLevel === "SENIOR") {
    return "Senior 14-Band";
  }

  return "Program level not set";
}

export function getNextBandLevel(currentBand?: string | null) {
  const currentIndex = bandLevelOptions.findIndex((bandLevel) => bandLevel === currentBand);

  return currentIndex >= 0 ? bandLevelOptions[currentIndex + 1] ?? null : null;
}

export function documentLink(document: { fileUrl?: string | null }) {
  return document.fileUrl?.trim() || "";
}

export function formatRole(role: Role) {
  return role === "CENTER_DIRECTOR"
    ? "Center Director"
    : role.charAt(0) + role.slice(1).toLowerCase();
}

export function isOperationalManagerRole(role: Role) {
  return role === "ADMIN" || role === "CENTER_DIRECTOR";
}

export function canManageUserFromSetup(viewer: { id: string; role: Role }, target: { id: string; role: Role }) {
  return viewer.role === "ADMIN"
    || (viewer.role === "CENTER_DIRECTOR"
      && viewer.id !== target.id
      && (target.role === "STUDENT" || target.role === "FACILITATOR"));
}

export function canResetUserPasswordFromSetup(viewer: { role: Role }, target: { role: Role }) {
  return viewer.role === "ADMIN"
    ? target.role !== "ADMIN"
    : viewer.role === "CENTER_DIRECTOR" && (target.role === "STUDENT" || target.role === "FACILITATOR");
}

export function isStudentInClub(student: MeetingsOverview["students"][number], clubId: string) {
  return Boolean(student.clubMemberships?.some((membership) => membership.clubId === clubId && membership.status === "ACTIVE"));
}

export function formatStudentClubs(student: MeetingsOverview["students"][number]) {
  const clubs = student.clubMemberships?.map((membership) => membership.club.name) ?? [];

  return clubs.length ? clubs.join(", ") : "No club";
}

export function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function isTodayOrFuture(value: string) {
  const target = new Date(value);
  const today = new Date();

  if (Number.isNaN(target.getTime())) {
    return false;
  }

  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
    >= Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}
