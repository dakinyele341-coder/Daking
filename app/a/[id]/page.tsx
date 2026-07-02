import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { AnimationPlayer } from "@/components/AnimationPlayer";
import { Brand } from "@/components/Logo";
import type { AnimationData } from "@/lib/types/animation";
import type { Json } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SharedAnimation {
  id: string;
  question_text: string;
  summary: string | null;
  animation_data: Json;
}

/**
 * Fetches a shared animation by id (public read policy on `animations`).
 * `cache()` dedupes the query between generateMetadata and the page render.
 * Returns null for junk ids, missing rows, and expired rows alike.
 */
const getSharedAnimation = cache(
  async (id: string): Promise<SharedAnimation | null> => {
    if (!UUID_RE.test(id)) return null;
    const supabase = createClient();
    const { data } = await supabase
      .from("animations")
      .select("id, question_text, summary, animation_data")
      .eq("id", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    return (data as SharedAnimation | null) ?? null;
  },
);

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const animation = await getSharedAnimation(params.id);
  if (!animation) {
    return { title: "Animation not found — Skribbl" };
  }
  const description =
    animation.summary ?? "An AI-generated whiteboard explainer animation.";
  return {
    title: `${animation.question_text} — Skribbl`,
    description,
    openGraph: {
      title: animation.question_text,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: animation.question_text,
      description,
    },
  };
}

/**
 * Public share page: /a/[id]. No login needed (every visitor gets an
 * anonymous session from middleware anyway). Plays the animation with the
 * study tools hidden and a "Make your own" CTA — this page is the viral loop.
 */
export default async function SharedAnimationPage({
  params,
}: {
  params: { id: string };
}) {
  const animation = await getSharedAnimation(params.id);

  return (
    <main className="container max-w-3xl py-5 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-2 sm:mb-8">
        <Link href="/" aria-label="Skribbl home">
          <Brand logoClassName="h-6 w-6 sm:h-7 sm:w-7" textClassName="text-xl sm:text-2xl" />
        </Link>
        <Link
          href="/create"
          className="rounded-md bg-marker px-3 py-1.5 text-sm font-medium text-paper transition hover:opacity-90"
        >
          Make your own
        </Link>
      </header>

      {animation ? (
        <div className="space-y-4">
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {animation.question_text}
          </h1>
          <AnimationPlayer
            animation={animation.animation_data as unknown as AnimationData}
            animationId={animation.id}
            question={animation.question_text}
            isShared
            enableQuiz={false}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-ink/15 bg-muted/40 px-6 py-16 text-center">
          <p className="font-display text-xl font-bold">
            This animation has expired
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Shared animations are kept for 90 days. The good news: you can
            generate a fresh one about anything in about 20 seconds.
          </p>
          <Link
            href="/create"
            className="rounded-lg bg-marker px-5 py-2.5 text-sm font-semibold text-paper transition hover:opacity-90"
          >
            Generate your own →
          </Link>
        </div>
      )}
    </main>
  );
}
