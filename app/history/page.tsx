import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { HistoryList, type HistoryItem } from "@/components/HistoryList";
import type { AnimationData } from "@/lib/types/animation";
import type { Complexity, Json } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface HistoryAnimation {
  id: string;
  question_text: string;
  complexity: Complexity;
  summary: string | null;
  animation_data: Json;
  created_at: string;
}

interface HistoryRow {
  id: string;
  created_at: string;
  animations: HistoryAnimation | null;
}

/**
 * History page (Server Component). Reads the current user's saved animations
 * by joining `user_history` to `animations`. RLS guarantees a user only ever
 * sees their own history rows.
 */
export default async function HistoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: HistoryItem[] = [];

  if (user) {
    const { data } = await supabase
      .from("user_history")
      .select(
        "id, created_at, animations ( id, question_text, complexity, summary, animation_data, created_at )",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    const rows = (data ?? []) as unknown as HistoryRow[];
    items = rows
      .filter((row): row is HistoryRow & { animations: HistoryAnimation } =>
        row.animations !== null,
      )
      .map((row) => ({
        historyId: row.id,
        animationId: row.animations.id,
        questionText: row.animations.question_text,
        complexity: row.animations.complexity,
        createdAt: row.created_at,
        animation: row.animations.animation_data as unknown as AnimationData,
      }));
  }

  return (
    <main className="container max-w-3xl py-5 sm:py-10">
      <AppHeader />

      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">History</h1>

      <HistoryList items={items} />
    </main>
  );
}
