import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quizResultSchema, validateOrError } from "@/lib/security/validation";

export const runtime = "nodejs";

/**
 * POST /api/quiz-results
 *
 * Records a quiz score for the signed-in (or anonymous) user. Inserts via the
 * user-scoped server client so RLS guarantees `user_id = auth.uid()` — a user
 * can never write a result for someone else.
 */
export async function POST(request: NextRequest) {
  try {
    return await handleQuizResult(request);
  } catch (err) {
    console.error("[Skribbl] quiz-results handler error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

async function handleQuizResult(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateOrError(quizResultSchema, body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed.", fields: validation.errors },
      { status: 400 },
    );
  }
  const { animationId, score, total } = validation.data;

  // Guard against a score that exceeds the total (cheap sanity check beyond Zod).
  if (score > total) {
    return NextResponse.json(
      { error: "Score cannot exceed total." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("quiz_results").insert({
    user_id: user.id,
    animation_id: animationId,
    score,
    total,
  });

  if (error) {
    // Most likely the animation_id doesn't exist (FK violation) or RLS denied.
    return NextResponse.json(
      { error: "Could not save quiz result." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
