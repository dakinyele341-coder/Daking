import { LandingDemo } from "@/components/LandingDemo";

/**
 * Paper section holding the live demo. The 3-step flow is rendered as small
 * font-hand annotation callouts around the player (on wide screens) and as a
 * single hand-lettered caption underneath on narrow ones — never a numbered
 * feature grid.
 */
export function DemoSection() {
  return (
    <section className="bg-paper py-20">
      <div className="container max-w-4xl">
        <p className="mb-6 text-center font-hand text-xl text-ink-muted">
          Live demo — “How does photosynthesis work?”
        </p>

        <div className="relative">
          {/* Callouts (wide screens only, positioned outside the player box). */}
          <span className="pointer-events-none absolute -left-4 -top-6 hidden -rotate-3 font-hand text-lg text-ink xl:block">
            Ask anything ↘
          </span>
          <span className="pointer-events-none absolute -right-6 top-1/3 hidden rotate-2 font-hand text-lg text-ink xl:block">
            ↤ Watch it explained
          </span>
          <span className="pointer-events-none absolute -bottom-6 left-1/2 hidden -translate-x-1/2 font-hand text-lg text-ink xl:block">
            Then test yourself ↑
          </span>

          <LandingDemo />
        </div>

        {/* Narrow-screen caption. */}
        <p className="mt-6 text-center font-hand text-base text-ink-muted xl:hidden">
          Ask anything · Watch it explained · Test yourself
        </p>
      </div>
    </section>
  );
}
