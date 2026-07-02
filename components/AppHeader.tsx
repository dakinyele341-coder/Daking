"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/create", label: "Create" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * Shared top menu bar for the app pages (Create / History / Settings).
 * Client component: it checks the session client-side to decide whether to
 * show the Admin link, and highlights the active route.
 */
export function AppHeader() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (active && user && isAdminEmail(user.email)) setIsAdmin(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link href="/" aria-label="Skribbl home">
        <Brand />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
        {NAV_LINKS.map((link) => {
          const current = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                current
                  ? "bg-chalkboard font-medium text-paper"
                  : "text-muted-foreground hover:bg-muted hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-marker hover:bg-muted"
          >
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}
