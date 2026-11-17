"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Dumbbell, LineChart, NotebookPen, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Today", icon: CalendarCheck, module: null },
  { href: "/workout", label: "Train", icon: Dumbbell, module: "train" },
  { href: "/fuel", label: "Fuel", icon: UtensilsCrossed, module: "fuel" },
  { href: "/journal", label: "Journal", icon: NotebookPen, module: "journal" },
  { href: "/progress", label: "Progress", icon: LineChart, module: "train" },
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-md">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium uppercase tracking-[0.12em] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
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
