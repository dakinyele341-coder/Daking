import Link from "next/link";

export const metadata = {
  title: "Privacy & Terms — Skribbl",
};

/**
 * Placeholder legal page. Replace with real Privacy Policy and Terms of Service
 * before any public launch / monetization.
 */
export default function LegalPage() {
  return (
    <main className="container max-w-2xl py-12">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Privacy &amp; Terms</h1>
        <Link href="/" className="text-sm text-muted-foreground underline">
          Home
        </Link>
      </header>

      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          This is a placeholder. A full Privacy Policy and Terms of Service will
          be published here before launch.
        </p>
        <p>
          In short: questions you submit are used to generate explanations and
          may be cached to speed up repeated questions. Analytics records only
          anonymous usage metadata (counts and categories), never your question
          text.
        </p>
      </div>
    </main>
  );
}
