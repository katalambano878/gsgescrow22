"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { NavList, type NavItem } from "./sidebar";

/**
 * Mobile nav: sticky top bar + slide-in drawer. Mount this at the
 * root of the app shell so it sits above the horizontal sidebar+main
 * row and remains visible while scrolling.
 *
 * Accepts the same nav items as the desktop sidebar. Icons are passed
 * as React component references — this file is a client component, so
 * it can safely receive those from parents that are also client or via
 * the server->client boundary as imported modules (not closures).
 */
export function AppMobileNav({
  items,
  active,
  footer,
  brandSubtitle,
}: {
  items: NavItem[];
  active?: string;
  footer?: React.ReactNode;
  brandSubtitle?: string;
}) {
  const pathname = usePathname();
  const resolvedActive = active ?? pathname ?? undefined;
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes (state-adjust-during-render
  // pattern — avoids a cascading effect render).
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <>
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur px-4 h-14">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-[var(--surface-muted)]"
        >
          <Menu size={20} />
        </button>
      </div>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-[var(--foreground)]/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 h-full w-[82vw] max-w-[320px] bg-[var(--surface)] border-r border-[var(--border)] shadow-2xl flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--border)]">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-[var(--surface-muted)]"
          >
            <X size={20} />
          </button>
        </div>
        {brandSubtitle && (
          <p className="px-5 pt-3 text-xs uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
            {brandSubtitle}
          </p>
        )}
        <div className="flex-1 overflow-y-auto">
          <NavList items={items} active={resolvedActive} onNavigate={() => setOpen(false)} />
        </div>
        {footer && (
          <div className="p-3 border-t border-[var(--border)]">{footer}</div>
        )}
      </aside>
    </>
  );
}
