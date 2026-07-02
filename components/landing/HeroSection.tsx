import Link from "next/link";

/**
 * Chalkboard hero. Full-bleed chalkboard background with a faint grain overlay,
 * a Bricolage display headline in paper, a single static chalk-style underline
 * under the key word, a chalk-dust subheadline, and the one marker CTA.
 *
 * Pure presentational — the scroll wipe lives in <ChalkboardWipe />.
 */
export function HeroSection() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-chalkboard">
      {/* Faint chalk-dust grain — inline SVG fractal noise, no image asset. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <h1 className="font-display text-4xl font-bold leading-tight text-paper sm:text-6xl">
          Turn any question into a{" "}
          <span className="relative inline-block">
            visual
            {/* Static hand-chalk underline. */}
            <svg
              aria-hidden
              viewBox="0 0 200 16"
              preserveAspectRatio="none"
              className="absolute -bottom-2 left-0 h-3 w-full text-chalk-yellow"
            >
              <path
                d="M3 9 C 40 3, 80 13, 120 7 S 180 4, 197 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>{" "}
          answer
        </h1>

        <p className="mx-auto mt-6 max-w-xl font-sans text-lg text-chalk-dust">
          Type a question and Skribbl draws you a hand-drawn whiteboard
          animation with narration — explaining it in seconds.
        </p>

        <div className="mt-10">
          <Link
            href="/create"
            className="inline-block rounded-md bg-marker px-6 py-3 font-sans text-base font-medium text-paper shadow-sm transition-opacity hover:opacity-90"
          >
            Try it free
          </Link>
        </div>
      </div>
    </div>
  );
}
