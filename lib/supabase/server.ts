import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

/**
 * Server Supabase client (Server Components & Route Handlers).
 *
 * Reads the user's session from cookies via `next/headers` and respects Row
 * Level Security — it acts as the signed-in (or anonymous) user, NOT as an
 * admin. Use this for any user-scoped read/write.
 *
 * Note: writing cookies from a Server Component throws; that's expected and
 * swallowed here. Session refresh writes happen in `middleware.ts`.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // Session refresh is handled by middleware, so this is safe.
          }
        },
      },
    },
  );
}
