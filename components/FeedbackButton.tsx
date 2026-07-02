"use client";

import { useEffect, useState } from "react";
import { track, type FeedbackCategory } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "skribbl:open-feedback";
const MAX_LEN = 1000;

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "confusing", label: "Confusing animation" },
  { value: "other", label: "Other" },
];

/** A text trigger (e.g. for the footer) that opens the global feedback modal. */
export function OpenFeedbackLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={className}
    >
      Feedback
    </button>
  );
}

/**
 * Global feedback widget: a floating button (bottom-right) plus a modal. Also
 * opens when any element dispatches the `skribbl:open-feedback` window event.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  function reset() {
    setCategory("idea");
    setMessage("");
    setSubmitting(false);
    setDone(false);
    setError(null);
  }

  function close() {
    setOpen(false);
    // Reset after the modal is dismissed so it's fresh next open.
    setTimeout(reset, 200);
  }

  const trimmed = message.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= MAX_LEN;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: trimmed,
          pagePath:
            typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });

      if (!res.ok) {
        setError("Couldn't send feedback. Please try again.");
        return;
      }

      track.feedbackSubmitted(category);
      setDone(true);
    } catch {
      setError("Couldn't send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-marker px-4 py-2 text-sm font-medium text-paper shadow-lg transition-opacity hover:opacity-90"
        aria-label="Send feedback"
      >
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="space-y-4 text-center">
                <h2 className="font-display text-lg font-semibold">Thanks for the feedback!</h2>
                <p className="text-sm text-muted-foreground">
                  We read every note — it really helps.
                </p>
                <button
                  onClick={close}
                  className="rounded-md border border-ink px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold">Send feedback</h2>
                  <button
                    type="button"
                    onClick={close}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-1">
                  <label htmlFor="fb-category" className="text-sm font-medium">
                    Category
                  </label>
                  <select
                    id="fb-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="fb-message" className="text-sm font-medium">
                    Message
                  </label>
                  <textarea
                    id="fb-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    maxLength={MAX_LEN}
                    placeholder="What's on your mind?"
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="text-right text-xs text-muted-foreground">
                    {trimmed.length} / {MAX_LEN}
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={!valid || submitting}
                  className={cn(
                    "w-full rounded-md bg-marker px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90",
                    (!valid || submitting) && "opacity-50",
                  )}
                >
                  {submitting ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
