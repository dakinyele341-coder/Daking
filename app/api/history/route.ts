import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/history
 *
 * Stub. Returns the signed-in (or anonymous) user's saved animation history.
 * RLS guarantees a user can only ever read their own rows, but we still
 * require a session here for a clean 401 instead of an empty list.
 *
 * Real implementation (pagination, joins to `animations`, favorites) lands in
 * a later pass.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
