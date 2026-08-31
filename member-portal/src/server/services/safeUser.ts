import type { Prisma } from "@prisma/client";

/**
 * The only user fields that are safe in responses visible to other members.
 * Keep this projection intentionally small: expanding it changes the API's
 * confidentiality boundary everywhere it is reused.
 */
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true
} as const satisfies Prisma.UserSelect;

/** User fields available to admins/facilitators and to the account owner. */
export const memberUserSelect = {
  ...publicUserSelect,
  email: true,
  isActive: true
} as const satisfies Prisma.UserSelect;

/** Named separately so facilitator relations cannot accidentally use `true`. */
export const facilitatorUserSelect = {
  ...memberUserSelect
} as const satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof memberUserSelect }>;

export function safeUserDto(user: SafeUser) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive
  };
}
