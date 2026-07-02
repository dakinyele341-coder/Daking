"use client";

import { useEffect, useRef, useState } from "react";
import { AnimationPlayer } from "@/components/AnimationPlayer";
import { SAMPLE_ANIMATION } from "@/lib/landing/sampleAnimation";

/**
 * Landing-page live demo. Mounts the real `AnimationPlayer` (which autoplays on
 * ready) only once it scrolls into view, so the sample animation starts playing
 * exactly when the visitor reaches it. Quiz is disabled — its sample id isn't a
 * real DB row.
 */
export function LandingDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // No IntersectionObserver (old browser / SSR-y env) → just show it.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      {inView ? (
        <AnimationPlayer
          animation={SAMPLE_ANIMATION}
          animationId="demo"
          enableQuiz={false}
        />
      ) : (
        <div className="aspect-video w-full rounded-lg border border-border bg-white shadow-sm" />
      )}
    </div>
  );
}
