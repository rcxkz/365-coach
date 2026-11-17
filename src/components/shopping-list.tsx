"use client";

import { useOptimistic, useTransition } from "react";
import { Check, Undo2, X } from "lucide-react";
import { setShoppingItem } from "@/app/fuel/week/actions";
import { cn } from "@/lib/utils";

export interface ShoppingListItem {
  id: number;
  label: string;
  status: "needed" | "bought" | "have";
  manual: boolean;
  /** "running low", or which meals need it. */
  note: string | null;
}

export interface ShoppingAisle {
  label: string;
  items: ShoppingListItem[];
}

type Change = { id: number; status: ShoppingListItem["status"] | "remove" };

/**
 * The in-store list (Phase 13): grouped by aisle in walking order, and
 * a tap ticks instantly — the server catches up in the background, so a
 * weak signal in the shop never makes the list wait.
 */
export function ShoppingList({ aisles }: { aisles: ShoppingAisle[] }) {
  const [, startTransition] = useTransition();
  const [view, apply] = useOptimistic(aisles, (current, change: Change) =>
    current.map((aisle) => ({
      ...aisle,
      items:
        change.status === "remove"
          ? aisle.items.filter((item) => item.id !== change.id)
          : aisle.items.map((item) =>
              item.id === change.id
                ? { ...item, status: change.status as ShoppingListItem["status"] }
                : item,
            ),
    })),
  );

  const set = (id: number, status: Change["status"]) =>
    startTransition(async () => {
      apply({ id, status });
      await setShoppingItem(id, status);
    });

  return (
    <div className="flex flex-col gap-5">
      {view
        .filter((aisle) => aisle.items.length > 0)
        .map((aisle) => (
          <section key={aisle.label}>
            <h3 className="eyebrow mb-1.5">{aisle.label}</h3>
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {aisle.items.map((item) => {
                const settled = item.status !== "needed";
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => set(item.id, settled ? "needed" : "bought")}
                      aria-label={settled ? `Put ${item.label} back on the list` : `Got ${item.label}`}
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                        settled ? "border-signal-go bg-signal-go text-background" : "border-input",
                      )}
                    >
                      {settled && <Check className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => set(item.id, settled ? "needed" : "bought")}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className={cn("block text-sm", settled && "text-muted-foreground line-through")}>
                        {item.label}
                      </span>
                      {(item.status === "have" || item.note) && (
                        <span className="block text-xs text-muted-foreground">
                          {item.status === "have" ? "already in" : item.note}
                        </span>
                      )}
                    </button>
                    {settled ? (
                      item.status === "have" && (
                        <button
                          type="button"
                          onClick={() => set(item.id, "needed")}
                          aria-label={`Put ${item.label} back on the list`}
                          className="p-1 text-muted-foreground"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => set(item.id, item.manual ? "remove" : "have")}
                        aria-label={item.manual ? `Remove ${item.label}` : `Already have ${item.label}`}
                        className="p-1 text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
