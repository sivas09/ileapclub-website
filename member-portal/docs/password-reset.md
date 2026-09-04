# Authorized password reset

Admins can reset passwords for members, facilitators, and center directors. Center directors can reset passwords only for members and facilitators wholly inside their assigned centre scope. Admin-to-admin resets are intentionally blocked, and facilitators and members cannot use the endpoint.

Each reset hashes the temporary password with bcrypt, increments the target account's session version to invalidate existing bearer tokens, and records the target user ID, resetting staff user ID, and timestamp in `PasswordResetAudit`. Plain passwords and password hashes are never stored in the audit record or returned by the endpoint.

The resetting staff member must share the temporary password securely and ask the user to change it through the existing self-service Change Password screen after login.

## Follow-up

A mandatory change-on-next-login flow is not included. Implementing it securely requires a restricted temporary session that can access only the Change Password and sign-out flows until the password is changed, with server-side enforcement on every other authenticated route.
