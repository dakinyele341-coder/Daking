import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// ⚠️ SERVICE ROLE CLIENT — BYPASSES ALL RLS POLICIES ⚠️
// - NEVER import this file in any file under /app that runs on the client
// - Only use inside Route Handlers (app/api/**/route.ts) for operations
//   that genuinely need to write to shared tables like `animations`
// - Every use of this client must validate input with Zod first
//
// The `import "server-only"` above makes the build FAIL if this module is
// ever pulled into a client component bundle — a compile-time guardrail.

let cached: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton service-role Supabase client. Created lazily so the
 * service-role key is only read when a server route actually needs admin
 * access, not at import time.
 */
export function createAdminClient() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "[Skribbl] Admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cached = createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cached;
}
