"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

const HIDDEN_ON = ["/settings", "/setup", "/unlock"];

/** Settings, one tap from every screen: top-right, out of the content's way. */
export function SettingsLink() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className="absolute right-2 top-2 z-30 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
    >
      <Settings className="h-5 w-5" aria-hidden />
    </Link>
  );
}
