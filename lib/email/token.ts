import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Small signed tokens for email links (unsubscribe / survey responses). The
 * token is `base64url(userId).base64url(HMAC-SHA256(userId))` so it can't be
 * forged — a raw base64 user id would let anyone unsubscribe/respond for any
 * account. Signed with CRON_SECRET (falls back to the service-role key).
 */

function secret(): string {
  return (
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "skribbl-dev-secret"
  );
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function signEmailToken(userId: string): string {
  const payload = b64url(userId);
  return `${payload}.${sign(payload)}`;
}

/** Returns the userId if the token is valid and untampered, else null. */
export function verifyEmailToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
