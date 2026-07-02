/**
 * Admin allow-list. Admins get free premium (long-form unlocked) and access to
 * the /admin dashboard. Enforced server-side; the value is also read on the
 * client only to show/hide admin UI (never the sole gate).
 */
export const ADMIN_EMAILS = ["dakinyele341@gmail.com"] as const;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (ADMIN_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}
