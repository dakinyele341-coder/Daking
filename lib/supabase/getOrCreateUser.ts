import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Ensures every visitor has a `user_id`.
 *
 * - If a session already exists (anonymous or full account), returns that user.
 * - Otherwise signs the visitor in anonymously, which creates an `auth.users`
 *   row (and, via the `on_auth_user_created` trigger, a `profiles` row).
 *
 * Anonymous users can use the app, save history, and be rate-limited by their
 * stable `user_id`. They can later upgrade to a full account with
 * `linkIdentity` without losing any data (see `/signup`).
 *
 * Intended to be called from the root layout so a `user_id` exists from the
 * very first pageview. Returns `null` only if anonymous sign-in fails (e.g.
 * the provider is disabled in the Supabase dashboard).
 */
export async function getOrCreateUser(): Promise<User | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return user;

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    // Don't throw — a failed anonymous sign-in shouldn't crash every page.
    // Most likely cause: anonymous sign-ins not enabled in Supabase Auth.
    console.error("[Skribbl] Anonymous sign-in failed:", error.message);
    return null;
  }

  return data.user;
}
