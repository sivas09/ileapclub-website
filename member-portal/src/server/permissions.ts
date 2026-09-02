import { Role } from "@prisma/client";
import { prisma } from "./db.js";

export const operationalManagerRoles = [Role.ADMIN, Role.CENTER_DIRECTOR];

export type RoleSubject = Role | { role: Role };

type AccountSubject = {
  id: string;
  role: Role;
};

export type OperationalScope = {
  centreIds: string[] | null;
  clubIds: string[] | null;
};

function roleOf(subject: RoleSubject) {
  return typeof subject === "string" ? subject : subject.role;
}

export function isAdmin(subject: RoleSubject) {
  return roleOf(subject) === Role.ADMIN;
}

export function isCenterDirector(subject: RoleSubject) {
  return roleOf(subject) === Role.CENTER_DIRECTOR;
}

export function isAdminOrCenterDirector(subject: RoleSubject) {
  return isAdmin(subject) || isCenterDirector(subject);
}

export function canManageOperationalData(subject: RoleSubject) {
  return isAdminOrCenterDirector(subject);
}

export function canManageAdminAccounts(subject: RoleSubject) {
  return isAdmin(subject);
}

export function canCreateAccountWithRole(actor: RoleSubject, role: Role) {
  if (canManageAdminAccounts(actor)) {
    return role !== Role.PARENT;
  }

  return isCenterDirector(actor) && (role === Role.STUDENT || role === Role.FACILITATOR);
}

export function canEditAccount(
  actor: AccountSubject,
  target: AccountSubject,
  nextRole: Role
) {
  if (canManageAdminAccounts(actor)) {
    return true;
  }

  return isCenterDirector(actor)
    && actor.id !== target.id
    && (target.role === Role.STUDENT || target.role === Role.FACILITATOR)
    && (nextRole === Role.STUDENT || nextRole === Role.FACILITATOR);
}

export function canManageAccountAccess(actor: RoleSubject, targetRole: Role) {
  return canManageAdminAccounts(actor)
    || (isCenterDirector(actor) && (targetRole === Role.STUDENT || targetRole === Role.FACILITATOR));
}

export async function getOperationalScope(user: AccountSubject): Promise<OperationalScope> {
  if (isAdmin(user)) {
    return { centreIds: null, clubIds: null };
  }

  if (isCenterDirector(user)) {
    const assignments = await prisma.centerDirectorAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { centreId: true }
    });
    const centreIds = unique(assignments.map((assignment) => assignment.centreId));
    const clubs = centreIds.length
      ? await prisma.club.findMany({ where: { centreId: { in: centreIds } }, select: { id: true } })
      : [];

    return { centreIds, clubIds: clubs.map((club) => club.id) };
  }

  if (user.role === Role.FACILITATOR) {
    const [clubAssignments, centreAssignments] = await Promise.all([
      prisma.clubFacilitator.findMany({
        where: { facilitatorId: user.id },
        select: { clubId: true, club: { select: { centreId: true } } }
      }),
      prisma.centreFacilitator.findMany({ where: { facilitatorId: user.id }, select: { centreId: true } })
    ]);
    const centreIds = unique(centreAssignments.map((assignment) => assignment.centreId));
    const centreClubs = centreIds.length
      ? await prisma.club.findMany({ where: { centreId: { in: centreIds } }, select: { id: true, centreId: true } })
      : [];
    const clubIds = unique([
      ...clubAssignments.map((assignment) => assignment.clubId),
      ...centreClubs.map((club) => club.id)
    ]);

    return {
      centreIds: unique([
        ...centreIds,
        ...clubAssignments.map((assignment) => assignment.club.centreId),
        ...centreClubs.map((club) => club.centreId)
      ]),
      clubIds
    };
  }

  if (user.role === Role.STUDENT) {
    const memberships = await prisma.studentClubMembership.findMany({
      where: { student: { userId: user.id }, status: "ACTIVE" },
      select: { clubId: true, club: { select: { centreId: true } } }
    });

    return {
      centreIds: unique(memberships.map((membership) => membership.club.centreId)),
      clubIds: unique(memberships.map((membership) => membership.clubId))
    };
  }

  return { centreIds: [], clubIds: [] };
}

export function scopeIncludesCentre(scope: OperationalScope, centreId: string) {
  return scope.centreIds === null || scope.centreIds.includes(centreId);
}

export function scopeIncludesClub(scope: OperationalScope, clubId: string) {
  return scope.clubIds === null || scope.clubIds.includes(clubId);
}

export async function canAccessStudent(user: AccountSubject, studentId: string) {
  const scope = await getOperationalScope(user);

  if (scope.clubIds === null) {
    return true;
  }

  if (!scope.clubIds.length) {
    return false;
  }

  return (await prisma.studentClubMembership.count({
    where: { studentId, clubId: { in: scope.clubIds } }
  })) > 0;
}

export async function canAccessFacilitator(user: AccountSubject, facilitatorId: string) {
  const scope = await getOperationalScope(user);

  if (scope.clubIds === null) {
    return true;
  }

  if (!scope.clubIds.length) {
    return false;
  }

  return (await prisma.clubFacilitator.count({
    where: { facilitatorId, clubId: { in: scope.clubIds } }
  })) > 0;
}

export async function canAccessManagedUser(user: AccountSubject, targetUserId: string, targetRole: Role) {
  if (isAdmin(user)) {
    return true;
  }

  if (!isCenterDirector(user)) {
    return false;
  }

  const scope = await getOperationalScope(user);

  if (!scope.clubIds?.length) {
    return false;
  }

  if (targetRole === Role.STUDENT) {
    return (await prisma.studentClubMembership.count({
      where: { student: { userId: targetUserId }, clubId: { in: scope.clubIds } }
    })) > 0;
  }

  if (targetRole === Role.FACILITATOR) {
    return (await prisma.clubFacilitator.count({
      where: { facilitatorId: targetUserId, clubId: { in: scope.clubIds } }
    })) > 0;
  }

  return false;
}

export async function canManageUserExclusively(user: AccountSubject, targetUserId: string, targetRole: Role) {
  if (isAdmin(user)) {
    return true;
  }

  if (!(await canAccessManagedUser(user, targetUserId, targetRole))) {
    return false;
  }

  const scope = await getOperationalScope(user);

  if (!scope.clubIds || !scope.centreIds) {
    return false;
  }

  if (targetRole === Role.STUDENT) {
    return (await prisma.studentClubMembership.count({
      where: { student: { userId: targetUserId }, clubId: { notIn: scope.clubIds } }
    })) === 0;
  }

  if (targetRole === Role.FACILITATOR) {
    const [outsideClubs, outsideCentres] = await Promise.all([
      prisma.clubFacilitator.count({ where: { facilitatorId: targetUserId, clubId: { notIn: scope.clubIds } } }),
      prisma.centreFacilitator.count({ where: { facilitatorId: targetUserId, centreId: { notIn: scope.centreIds } } })
    ]);

    return outsideClubs === 0 && outsideCentres === 0;
  }

  return false;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
