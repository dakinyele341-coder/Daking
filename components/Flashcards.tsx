"use client";

import { useMemo, useState } from "react";
import type { FlashCard } from "@/lib/types/animation";
import { cn } from "@/lib/utils";

/**
 * Simple study deck: tap a card to flip term ⇆ answer, move through the deck,
 * and shuffle. Works for the flashcards attached to any generated animation.
 */
export function Flashcards({ cards }: { cards: readonly FlashCard[] }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = order.length;
  const card = useMemo(() => cards[order[pos] ?? 0], [cards, order, pos]);
  if (!card || total === 0) return null;

  function go(delta: number) {
    setFlipped(false);
    setPos((p) => Math.min(total - 1, Math.max(0, p + delta)));
  }

  function shuffle() {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j]!, next[i]!];
    }
    setOrder(next);
    setPos(0);
    setFlipped(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-ink/15 p-5">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>
          Card {pos + 1} of {total}
        </span>
        <button onClick={shuffle} className="font-medium text-ink underline">
          Shuffle
        </button>
      </div>

      {/* The card — tap to flip. */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label="Flip card"
        className={cn(
          "flex min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-xl border px-6 py-8 text-center transition-colors",
          flipped
            ? "border-chalkboard bg-chalkboard text-paper"
            : "border-ink/20 bg-paper text-ink hover:bg-muted",
        )}
      >
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            flipped ? "text-paper/60" : "text-ink-muted",
          )}
        >
          {flipped ? "Answer" : "Term"}
        </span>
        <span className="text-lg font-medium leading-snug">
          {flipped ? card.back : card.front}
        </span>
        <span
          className={cn(
            "mt-1 text-xs",
            flipped ? "text-paper/50" : "text-ink-muted/70",
          )}
        >
          tap to flip
        </span>
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => go(-1)}
          disabled={pos === 0}
          className="rounded-md border border-ink px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-muted disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => go(1)}
          disabled={pos === total - 1}
          className="rounded-md bg-marker px-4 py-1.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
