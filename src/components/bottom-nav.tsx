"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Today", module: null },
  { href: "/workout", label: "Train", module: "train" },
  { href: "/fuel", label: "Fuel", module: "fuel" },
  { href: "/journal", label: "Journal", module: "journal" },
  { href: "/progress", label: "Progress", module: "train" },
] as const;

/**
 * The app's five places, one thumb away. Before this every screen was
 * reached through Today and left via a back link — fine on day one,
 * friction every day after.
 */
export function BottomNav({
  modules,
}: {
  /** From the user's setup (Phase 15): switched-off modules lose their tab. */
  modules: Record<"train" | "fuel" | "journal", boolean>;
}) {
  const pathname = usePathname();
  if (pathname === "/unlock" || pathname === "/setup") return null;
  const tabs = TABS.filter((tab) => tab.module === null || modules[tab.module]);

  return (
    <>
      {/* Keeps the last content clear of the fixed bar. */}
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))]" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-md">
          {tabs.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 font-mono text-[0.625rem] font-bold uppercase tracking-[0.14em] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {/* The DNA has no icon set: a brass ● marks where you are. */}
                  <span aria-hidden className={active ? "text-highlight" : "invisible"}>
                    ●
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
