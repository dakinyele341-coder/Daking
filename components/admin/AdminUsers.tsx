"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface AdminUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  plan: "free" | "premium";
  createdAt: string | null;
}

export function AdminUsers({ users }: { users: AdminUser[] }) {
  const [rows, setRows] = useState(users);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function togglePlan(user: AdminUser) {
    const nextPlan = user.plan === "premium" ? "free" : "premium";
    setBusyId(user.id);
    try {
      const res = await fetch("/api/admin/set-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, plan: nextPlan }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === user.id ? { ...r, plan: nextPlan } : r)),
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">No users yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-ink/15">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-4 py-2 font-medium">User</th>
            <th className="px-4 py-2 font-medium">Plan</th>
            <th className="px-4 py-2 font-medium">Joined</th>
            <th className="px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/10">
          {rows.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-2">
                {u.email ? (
                  <span className="font-medium">{u.email}</span>
                ) : (
                  <span className="text-ink-muted">Anonymous</span>
                )}
              </td>
              <td className="px-4 py-2">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-semibold",
                    u.plan === "premium"
                      ? "bg-marker/15 text-marker"
                      : "bg-muted text-ink-muted",
                  )}
                >
                  {u.plan}
                </span>
              </td>
              <td className="px-4 py-2 text-ink-muted">
                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
              </td>
              <td className="px-4 py-2">
                <button
                  onClick={() => togglePlan(u)}
                  disabled={busyId === u.id}
                  className="rounded-md border border-ink px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {busyId === u.id
                    ? "…"
                    : u.plan === "premium"
                      ? "Make free"
                      : "Make premium"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
