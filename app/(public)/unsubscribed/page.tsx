import Link from "next/link";
import { Brand } from "@/components/Logo";

export const metadata = { title: "Unsubscribed — Skribbl" };

export default function UnsubscribedPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <Brand />
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold text-ink">
          You&apos;ve been unsubscribed
        </h1>
        <p className="max-w-sm text-sm text-ink-muted">
          You won&apos;t get any more Skribbl lifecycle emails. You&apos;ll still
          receive essential account emails (like password resets).
        </p>
      </div>
      <Link
        href="/create"
        className="rounded-md border border-ink px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-muted"
      >
        Back to Skribbl
      </Link>
    </main>
  );
}
