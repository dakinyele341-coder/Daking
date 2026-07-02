"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

/**
 * Browser Supabase client.
 *
 * Uses ONLY public (NEXT_PUBLIC_*) env vars and is therefore safe to ship
 * to the browser. All queries made through this client are subject to Row
 * Level Security, scoped to the signed-in (or anonymous) user.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
