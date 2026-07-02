import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HeroSection } from "@/components/landing/HeroSection";
import { ChalkboardWipe } from "@/components/landing/ChalkboardWipe";
import { DemoSection } from "@/components/landing/DemoSection";
import { OpenFeedbackLink } from "@/components/FeedbackButton";
import { Brand } from "@/components/Logo";

export const dynamic = "force-dynamic";

const FAQ = [
  {
    q: "Is it free?",
    a: "Yes — Skribbl is free to use with generous daily limits.",
  },
  {
    q: "What subjects does it cover?",
    a: "Anything you can ask a question about: science, history, math, how things work, and more.",
  },
  {
    q: "How accurate is it?",
    a: "Explanations are AI-generated and usually solid, but always double-check anything high-stakes.",
  },
];

export default async function LandingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasAccount = Boolean(user) && !user?.is_anonymous;

  // Hero + its overlaid chalk nav. Passed as the pinned layer to the wipe.
  const hero = (
    <div className="relative h-full w-full">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6">
        <Brand textClassName="text-paper" logoClassName="text-paper" />
        <nav className="flex items-center gap-4 font-sans text-sm">
          {hasAccount ? (
            <Link href="/history" className="text-chalk-dust transition-colors hover:text-paper">
              History
            </Link>
          ) : (
            <Link href="/login" className="text-chalk-dust transition-colors hover:text-paper">
              Log in
            </Link>
          )}
          <Link
            href="/create"
            className="rounded-md bg-marker px-4 py-2 font-medium text-paper transition-opacity hover:opacity-90"
          >
            Try it free
          </Link>
        </nav>
      </header>
      <HeroSection />
    </div>
  );

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <ChalkboardWipe hero={hero}>
        <DemoSection />

        {/* FAQ */}
        <section className="container max-w-2xl py-16">
          <h2 className="mb-10 text-center font-display text-3xl font-bold text-ink">
            Frequently asked
          </h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border border-ink/15 bg-paper p-4"
              >
                <summary className="cursor-pointer list-none font-medium marker:content-none">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-ink/15">
          <div className="container flex flex-wrap items-center justify-between gap-4 py-8 text-sm">
            <Brand
              textClassName="text-lg text-ink"
              logoClassName="h-5 w-5 text-ink"
            />
            <nav className="flex flex-wrap items-center gap-4 text-ink-muted">
              <Link href="/create" className="hover:text-ink">
                Create
              </Link>
              {hasAccount ? (
                <Link href="/history" className="hover:text-ink">
                  History
                </Link>
              ) : (
                <Link href="/login" className="hover:text-ink">
                  Log in
                </Link>
              )}
              <OpenFeedbackLink className="hover:text-ink" />
              <Link href="/legal" className="hover:text-ink">
                Privacy &amp; Terms
              </Link>
            </nav>
          </div>
        </footer>
      </ChalkboardWipe>
    </div>
  );
}
