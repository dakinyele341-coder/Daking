"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimationPlayer } from "@/components/AnimationPlayer";
import type { AnimationData } from "@/lib/types/animation";
import type { Complexity } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export interface HistoryItem {
  historyId: string;
  animationId: string;
  questionText: string;
  complexity: Complexity;
  createdAt: string;
  animation: AnimationData;
}

const COMPLEXITY_LABEL: Record<Complexity, string> = {
  eli5: "ELI5",
  standard: "Standard",
  advanced: "Advanced",
};

export function HistoryList({ items }: { items: HistoryItem[] }) {
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing here yet —{" "}
        <Link href="/create" className="font-medium text-ink underline">
          ask your first question
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {selected && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">{selected.questionText}</h2>
          <AnimationPlayer
            key={selected.historyId}
            animation={selected.animation}
            animationId={selected.animationId}
            question={selected.questionText}
          />
        </div>
      )}

      <ul className="divide-y divide-ink/15 rounded-lg border border-ink/15">
        {items.map((item) => (
          <li
            key={item.historyId}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.questionText}</p>
              <p className="text-xs text-ink-muted">
                {COMPLEXITY_LABEL[item.complexity]} ·{" "}
                {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => setSelected(item)}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors",
                selected?.historyId === item.historyId
                  ? "border-chalkboard bg-chalkboard text-paper"
                  : "border-ink text-ink hover:bg-muted",
              )}
            >
              {selected?.historyId === item.historyId ? "Playing" : "Replay"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
