import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin";
import { AdminUsers, type AdminUser } from "@/components/admin/AdminUsers";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;
type CountTable =
  | "profiles"
  | "animations"
  | "user_history"
  | "quiz_results"
  | "feedback"
  | "security_events";

async function countOf(admin: Admin, table: CountTable): Promise<number> {
  const { count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function AdminPage() {
  // Gate: must be a signed-in admin.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/");
  }

  const admin = createAdminClient();

  const [
    profilesCount,
    animationsCount,
    historyCount,
    quizCount,
    feedbackCount,
    eventsCount,
  ] = await Promise.all([
    countOf(admin, "profiles"),
    countOf(admin, "animations"),
    countOf(admin, "user_history"),
    countOf(admin, "quiz_results"),
    countOf(admin, "feedback"),
    countOf(admin, "security_events"),
  ]);

  // Users (emails come from auth) merged with their plan from profiles.
  const { data: authList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, plan");
  const planById = new Map(
    (profileRows ?? []).map((p) => [p.id, p.plan]),
  );
  const users: AdminUser[] = (authList?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email && u.email.length > 0 ? u.email : null,
    isAnonymous: u.is_anonymous ?? false,
    plan: planById.get(u.id) === "premium" ? "premium" : "free",
    createdAt: u.created_at ?? null,
  }));

  const { data: feedback } = await admin
    .from("feedback")
    .select("id, category, message, page_path, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: events } = await admin
    .from("security_events")
    .select("id, event_type, identifier, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: animations } = await admin
    .from("animations")
    .select("id, question_text, complexity, hit_count, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const stats = [
    { label: "Users", value: profilesCount },
    { label: "Animations", value: animationsCount },
    { label: "History rows", value: historyCount },
    { label: "Quiz results", value: quizCount },
    { label: "Feedback", value: feedbackCount },
    { label: "Security events", value: eventsCount },
  ];

  return (
    <main className="container max-w-5xl py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Admin
        </h1>
        <Link href="/create" className="text-sm text-ink-muted underline">
          Back to app
        </Link>
      </header>

      {/* Stats */}
      <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-ink/15 bg-paper p-4"
          >
            <p className="text-2xl font-bold text-ink">{s.value}</p>
            <p className="text-xs text-ink-muted">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Users */}
      <section className="mb-10 space-y-3">
        <h2 className="font-display text-lg font-semibold">Users &amp; plans</h2>
        <AdminUsers users={users} />
      </section>

      {/* Feedback */}
      <section className="mb-10 space-y-3">
        <h2 className="font-display text-lg font-semibold">Recent feedback</h2>
        {feedback && feedback.length > 0 ? (
          <ul className="divide-y divide-ink/10 rounded-lg border border-ink/15">
            {feedback.map((f) => (
              <li key={f.id} className="p-4">
                <div className="mb-1 flex items-center gap-2 text-xs text-ink-muted">
                  <span className="rounded bg-muted px-2 py-0.5 font-medium uppercase">
                    {f.category}
                  </span>
                  <span>{new Date(f.created_at).toLocaleString()}</span>
                  {f.page_path && <span>· {f.page_path}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink">{f.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No feedback yet.</p>
        )}
      </section>

      {/* Security events */}
      <section className="mb-10 space-y-3">
        <h2 className="font-display text-lg font-semibold">Security events</h2>
        {events && events.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-ink/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Identifier</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-medium">{e.event_type}</td>
                    <td className="max-w-[12rem] truncate px-4 py-2 text-ink-muted">
                      {e.identifier ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="max-w-[20rem] truncate px-4 py-2 text-xs text-ink-muted">
                      {e.metadata ? JSON.stringify(e.metadata) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No events logged.</p>
        )}
      </section>

      {/* Animations */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Recent animations</h2>
        {animations && animations.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-ink/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Question</th>
                  <th className="px-4 py-2 font-medium">Complexity</th>
                  <th className="px-4 py-2 font-medium">Hits</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {animations.map((a) => (
                  <tr key={a.id}>
                    <td className="max-w-[24rem] truncate px-4 py-2">
                      {a.question_text}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{a.complexity}</td>
                    <td className="px-4 py-2 text-ink-muted">{a.hit_count}</td>
                    <td className="px-4 py-2 text-ink-muted">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No animations yet.</p>
        )}
      </section>
    </main>
  );
}
