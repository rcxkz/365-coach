import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A section that folds away: the heading stays, the rest opens on a tap.
 * A native <details>, so it works with no JS. `aside` is a short line
 * shown beside the heading (a count, the latest number) so a closed
 * section still says what's in it.
 */
export function Fold({
  title,
  aside,
  open = false,
  className,
  children,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  open?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className={cn("group border-t border-border", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden">
        <h2 className="eyebrow">{title}</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {aside}
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}
