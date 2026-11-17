"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { saveKitchen } from "@/app/fuel/kitchen/actions";
import {
  AISLE_LABELS,
  AISLES,
  formatIngredient,
  ingredientKey,
  INGREDIENT_GROUPS,
  type Aisle,
} from "@/domain/meals";
import { cn } from "@/lib/utils";

type Stock = "in" | "low";

/**
 * The kitchen, entered in one pass (decision K1).
 *
 * Selection is held on the client and submitted once. The version this
 * replaces did a server round trip and a full page reload per
 * ingredient, which made recording a real kitchen a twenty-reload job —
 * and that, not laziness, is why the last one was stocked once and then
 * wiped.
 *
 * Phase 13: a tap cycles out → in → running low → out; anything not in
 * the list can be added; "start fresh" clears it for a full re-count.
 */
export function KitchenForm({
  initial,
  custom,
}: {
  initial: { ingredient: string; runningLow: boolean }[];
  custom: { key: string; aisle: Aisle }[];
}) {
  const initialStock = useMemo(
    () =>
      new Map<string, Stock>(
        initial.map((item) => [item.ingredient, item.runningLow ? "low" : "in"]),
      ),
    [initial],
  );
  const [stock, setStock] = useState<Map<string, Stock>>(initialStock);
  const [added, setAdded] = useState<{ key: string; aisle: Aisle }[]>([]);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newAisle, setNewAisle] = useState<Aisle>("cupboard");

  const allCustom = [...custom, ...added];
  const groups = AISLES.map((aisle) => {
    const builtIn = INGREDIENT_GROUPS.find((group) => group.aisle === aisle);
    return {
      aisle,
      label: AISLE_LABELS[aisle],
      ingredients: [
        ...((builtIn?.ingredients ?? []) as readonly string[]),
        ...allCustom.filter((item) => item.aisle === aisle).map((item) => item.key),
      ],
    };
  });

  const needle = query.trim().toLowerCase();
  const matches = (ingredient: string) =>
    !needle || formatIngredient(ingredient).includes(needle);

  const cycle = (ingredient: string) => {
    setStock((current) => {
      const next = new Map(current);
      const state = next.get(ingredient);
      if (!state) next.set(ingredient, "in");
      else if (state === "in") next.set(ingredient, "low");
      else next.delete(ingredient);
      return next;
    });
  };

  // Typed into "something else", or straight from a search that found nothing.
  const addOwn = () => {
    const key = ingredientKey(newName.trim() || query.trim());
    if (!key) return;
    const known = groups.some((group) => group.ingredients.includes(key));
    if (!known) setAdded((current) => [...current, { key, aisle: newAisle }]);
    setStock((current) => new Map(current).set(key, "in"));
    setNewName("");
    setQuery("");
  };

  const startFresh = () => {
    if (
      stock.size === 0 ||
      window.confirm("Clear the whole kitchen and start the count again? Nothing is saved until you tap Save.")
    ) {
      setStock(new Map());
    }
  };

  const changed =
    added.length > 0 ||
    stock.size !== initialStock.size ||
    [...stock].some(([ingredient, state]) => initialStock.get(ingredient) !== state);
  const lowCount = [...stock.values()].filter((state) => state === "low").length;

  return (
    <form action={saveKitchen}>
      {[...stock].map(([ingredient, state]) => (
        <input
          key={ingredient}
          type="hidden"
          name="ingredient"
          value={state === "low" ? `${ingredient}:low` : ingredient}
        />
      ))}
      {added.map((item) => (
        <input key={item.key} type="hidden" name="custom" value={`${item.key}|${item.aisle}`} />
      ))}

      <div className="mb-5 flex items-center gap-2">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an ingredient"
            className="h-full flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <button
          type="button"
          onClick={startFresh}
          className="h-10 shrink-0 rounded-md border border-input px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Start fresh
        </button>
      </div>

      <p className="mb-5 text-xs text-muted-foreground">
        Tap once for <span className="text-foreground">in</span>, again for{" "}
        <span className="text-signal-ease">running low</span> (it goes on the
        shopping list), again to take it out.
      </p>

      <div className="flex flex-col gap-6 pb-28">
        {groups.map((group) => {
          const visible = group.ingredients.filter(matches);
          if (visible.length === 0) return null;
          return (
            <section key={group.aisle}>
              <h2 className="eyebrow mb-2.5">{group.label}</h2>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((ingredient) => {
                  const state = stock.get(ingredient);
                  return (
                    <button
                      key={ingredient}
                      type="button"
                      onClick={() => cycle(ingredient)}
                      aria-label={`${formatIngredient(ingredient)}: ${state === "low" ? "running low" : state === "in" ? "in" : "not in"}`}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        state === "in" && "border-foreground bg-foreground text-background",
                        state === "low" && "border-signal-ease bg-signal-ease/10 text-foreground",
                        !state && "border-border text-muted-foreground hover:border-foreground/40",
                      )}
                    >
                      {formatIngredient(ingredient)}
                      {state === "low" && <span className="text-signal-ease"> · low</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="rounded-lg border p-3">
          <h2 className="eyebrow mb-2.5">Something else</h2>
          <div className="flex flex-col gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addOwn();
                }
              }}
              placeholder={needle ? `Add “${query.trim()}”` : "e.g. chorizo, gochujang, oat yoghurt"}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <select
                value={newAisle}
                onChange={(event) => setNewAisle(event.target.value as Aisle)}
                aria-label="Where it lives"
                className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                {AISLES.map((aisle) => (
                  <option key={aisle} value={aisle}>
                    {AISLE_LABELS[aisle]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addOwn}
                className="inline-flex h-10 items-center gap-1 rounded-md border border-input px-3 text-sm"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Sticky, because the list is long and the save belongs wherever
          you finish tapping rather than at the bottom of a scroll. It
          sits above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
          <p className="figure flex-1 text-xs text-muted-foreground">
            {stock.size} in{lowCount > 0 ? ` · ${lowCount} low` : ""}
          </p>
          <button
            type="submit"
            disabled={!changed}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {changed ? "Save the kitchen" : "Saved"}
          </button>
        </div>
      </div>
    </form>
  );
}
