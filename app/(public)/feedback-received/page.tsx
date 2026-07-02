import Link from "next/link";
import { Brand } from "@/components/Logo";

export const metadata = { title: "Thanks — Skribbl" };

export default function FeedbackReceivedPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <Brand />
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold text-ink">
          Thanks for the feedback
        </h1>
        <p className="text-sm text-ink-muted">
          It genuinely helps us decide what to build next.
        </p>
      </div>
      <Link
        href="/create"
        className="rounded-md bg-marker px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
      >
        Back to Skribbl
      </Link>
    </main>
  );
}
