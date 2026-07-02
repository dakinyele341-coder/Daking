"use client";

import { useState } from "react";
import { track } from "@/lib/analytics/events";

interface ShareSectionProps {
  animationId: string;
  question: string;
}

/**
 * Share row shown once an animation finishes (earn the share first).
 * Primary button uses the native share sheet where available (iOS/Android),
 * falling back to copy-link; X and WhatsApp get dedicated buttons (WhatsApp
 * especially — it's how students actually share things).
 */
export function ShareSection({ animationId, question }: ShareSectionProps) {
  const [copied, setCopied] = useState(false);

  // Build from the real origin so localhost shares localhost links and
  // production shares production links, with the configured URL as fallback.
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "";
  const shareUrl = `${base}/a/${animationId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track.animationShared("copy_link");
    } catch {
      // Clipboard can be unavailable (permissions/http) — no crash, no toast.
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: question,
          text: `Watch this whiteboard animation: "${question}"`,
          url: shareUrl,
        });
        track.animationShared("native_share");
      } catch {
        // User dismissed the sheet — not an error.
      }
    } else {
      await copyLink();
    }
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-ink/15 bg-muted/40 p-4">
      <p className="text-sm font-medium text-ink-muted">Share this animation</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() => void nativeShare()}
          className="rounded-lg bg-marker px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90"
        >
          {copied ? "✓ Copied!" : "Share"}
        </button>

        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
            `Just learned about "${question}" with this whiteboard animation 🎨`,
          )}&url=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track.animationShared("twitter")}
          className="rounded-lg border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper"
        >
          Post on X
        </a>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Watch this: "${question}" explained as a whiteboard animation\n${shareUrl}`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track.animationShared("whatsapp")}
          className="rounded-lg border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
