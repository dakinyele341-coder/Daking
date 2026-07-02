"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [keptHistory, setKeptHistory] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    // If the visitor is currently an anonymous user, UPGRADE their existing
    // session to a full account so their history/quiz data isn't lost.
    // Otherwise, do a normal email/password sign-up.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isAnonymous = user?.is_anonymous ?? false;

    if (isAnonymous && user) {
      const { error: updateError } = await supabase.auth.updateUser({
        email,
        password,
      });

      setLoading(false);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setKeptHistory(true);
      setEmailSent(true);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/create`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // If email confirmation is disabled, a session is returned immediately —
    // skip straight into the app.
    if (data.session) {
      router.push("/create");
      router.refresh();
      return;
    }

    setEmailSent(true);
  }

  // Prominent "check your inbox" confirmation screen.
  if (emailSent) {
    return (
      <main className="container flex min-h-screen flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-5 rounded-lg border border-ink/15 bg-paper p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-marker/15 text-3xl">
            ✉️
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Check your inbox
          </h1>
          <p className="text-sm text-ink-muted">
            We sent a confirmation link to
          </p>
          <p className="break-all rounded-md border border-ink/15 bg-muted/50 px-3 py-2 font-medium text-ink">
            {email}
          </p>
          <p className="text-sm text-ink-muted">
            Click the link in that email to activate your Skribbl account.
            {keptHistory && " Your existing history will be kept."}
          </p>
          <p className="text-xs text-ink-muted">
            Didn&apos;t get it? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={() => {
                setEmailSent(false);
                setKeptHistory(false);
              }}
              className="font-medium text-ink underline"
            >
              try again
            </button>
            .
          </p>
          <Link
            href="/login"
            className="inline-block rounded-md border border-ink px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            Back to log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6"
      >
        <h1 className="font-display text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-muted-foreground">
          Upgrade your guest session to a full account to keep your history
          across devices.
        </p>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-marker px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create account"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
