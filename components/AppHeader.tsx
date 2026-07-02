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
    <header className="mb-6 flex items-center justify-between gap-2 sm:mb-8 sm:gap-4">
      <Link href="/" aria-label="Skribbl home" className="shrink-0">
        <Brand logoClassName="h-6 w-6 sm:h-7 sm:w-7" textClassName="text-xl sm:text-2xl" />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-2">
        {NAV_LINKS.map((link) => {
          const current = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "rounded-md px-2 py-1.5 text-[13px] transition-colors sm:px-2.5 sm:text-sm",
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
            className="rounded-md px-2 py-1.5 text-[13px] font-medium text-marker hover:bg-muted sm:px-2.5 sm:text-sm"
          >
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}
