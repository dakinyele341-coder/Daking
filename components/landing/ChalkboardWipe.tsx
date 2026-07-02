"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/**
 * The signature scroll transition: the chalkboard hero is pinned (sticky) while
 * the opaque paper content scrolls up and over it, wiping the chalkboard away.
 *
 * This is intentionally a single CSS mechanism (sticky + stacking) — no scroll
 * listeners, no parallax, no particles. It stays smooth because the browser
 * compositor does the work.
 *
 * `prefers-reduced-motion` OR mobile (< 640px) → hard cut: the hero is just a
 * normal full-height section followed by the paper content, no pinning.
 */
export function ChalkboardWipe({
  hero,
  children,
}: {
  hero: ReactNode;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // `reduced` defaults true and `isMobile` defaults true, so the first render
  // (and SSR) is the safe hard-cut; desktop upgrades to the wipe after mount.
  const hardCut = reduced || isMobile;

  if (hardCut) {
    return (
      <>
        <section className="h-screen">{hero}</section>
        <div className="relative bg-paper">{children}</div>
      </>
    );
  }

  return (
    <div className="relative">
      <div className="sticky top-0 z-0 h-screen">{hero}</div>
      <div className="relative z-10 bg-paper">{children}</div>
    </div>
  );
}
