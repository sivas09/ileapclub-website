import { Role } from "@prisma/client";

export const operationalManagerRoles = [Role.ADMIN, Role.CENTER_DIRECTOR];

export type RoleSubject = Role | { role: Role };

type AccountSubject = {
  id: string;
  role: Role;
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
