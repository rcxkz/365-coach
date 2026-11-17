"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { draftMeal, saveMeal, type SaveMealState } from "@/app/fuel/meals/actions";
import { Button } from "@/components/ui/button";
import {
  formatIngredient,
  ingredientKey,
  PROTEIN_FOCUS,
  type MealSlot,
  type ProteinFocus,
  type UserMealInput,
} from "@/domain/meals";

const field =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const DRAFT_FAILED: Record<string, string> = {
  not_configured: "The AI coach isn't connected, so fill it in by hand below.",
  unreadable: "Couldn't find a meal in that — try a sentence like “chicken traybake with peppers, 10 minutes hands-on”.",
  failed: "That didn't go through — worth another try, or fill it in below.",
};

function IngredientPicker({
  name,
  label,
  hint,
  value,
  onChange,
  suggestions,
}: {
  name: string;
  label: string;
  hint: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
}) {
  const [text, setText] = useState("");
  const listId = `${name}-suggestions`;
  const add = () => {
    const key = ingredientKey(text);
    if (key && !value.includes(key)) onChange([...value, key]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      {value.map((key) => (
        <input key={key} type="hidden" name={name} value={key} />
      ))}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(value.filter((item) => item !== key))}
              aria-label={`Remove ${formatIngredient(key)}`}
              className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-3 py-1 text-sm text-background"
            >
              {formatIngredient(key)} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          list={listId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Type an ingredient"
          className={field}
        />
        <datalist id={listId}>
          {suggestions.map((key) => (
            <option key={key} value={formatIngredient(key)} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={add}
          aria-label={`Add to ${label.toLowerCase()}`}
          className="inline-flex h-10 shrink-0 items-center rounded-md border border-input px-3"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Add or edit one of the user's meals (Phase 13). The describe box
 * drafts the fields with AI; the form is always the thing that's saved,
 * so the user sees and can fix every value first.
 */
export function MealForm({
  id,
  initial,
  suggestions,
  aiAvailable,
}: {
  id?: string;
  initial: UserMealInput;
  suggestions: string[];
  aiAvailable: boolean;
}) {
  const [meal, setMeal] = useState<UserMealInput>(initial);
  const [version, setVersion] = useState(0);
  const [describe, setDescribe] = useState("");
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [drafting, startDrafting] = useTransition();
  const [state, formAction, saving] = useActionState<SaveMealState, FormData>(saveMeal, null);

  const set = <K extends keyof UserMealInput>(key: K, value: UserMealInput[K]) =>
    setMeal((current) => ({ ...current, [key]: value }));

  const toggleSlot = (slot: MealSlot) =>
    set(
      "slots",
      meal.slots.includes(slot) ? meal.slots.filter((s) => s !== slot) : [...meal.slots, slot],
    );

  const runDraft = () =>
    startDrafting(async () => {
      const result = await draftMeal(describe);
      if (!result.ok) {
        setDraftNote(DRAFT_FAILED[result.reason]);
        return;
      }
      setMeal(result.draft);
      // Uncontrolled textareas/inputs re-mount with the new values.
      setVersion((v) => v + 1);
      setDraftNote(
        result.newIngredients.length
          ? `Filled in — check it over. New to your kitchen: ${result.newIngredients.map(formatIngredient).join(", ")}.`
          : "Filled in — check it over, then save.",
      );
    });

  return (
    <div className="flex flex-col gap-6">
      {aiAvailable && (
        <section className="rounded-lg border p-4">
          <h2 className="eyebrow mb-1">Describe it, or paste a recipe</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            The coach fills in the form below for you to check, swapping
            anything that breaks your food rules.
          </p>
          <textarea
            value={describe}
            onChange={(event) => setDescribe(event.target.value)}
            placeholder="e.g. Sausage and bean one-pot — sausages, tinned beans, tomatoes, onion. 15 min hands-on, 40 total. Freezes well."
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={runDraft}
            disabled={drafting || describe.trim().length < 3}
          >
            <Sparkles className="h-4 w-4" />
            {drafting ? "Reading it…" : "Fill it in for me"}
          </Button>
          {draftNote && <p className="mt-2 text-sm">{draftNote}</p>}
        </section>
      )}

      <form key={version} action={formAction} className="flex flex-col gap-5">
        {id && <input type="hidden" name="id" value={id} />}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            value={meal.name}
            onChange={(event) => set("name", event.target.value)}
            className={field}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">One line about it</span>
          <input
            name="description"
            value={meal.description ?? ""}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Optional — what it is, why it's easy"
            className={field}
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Good for</legend>
          <div className="flex gap-2">
            {(["dinner", "lunch"] as const).map((slot) => (
              <label key={slot} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="slots"
                  value={slot}
                  checked={meal.slots.includes(slot)}
                  onChange={() => toggleSlot(slot)}
                />
                {slot === "dinner" ? "Dinner" : "Lunch"}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Hands-on min</span>
            <input
              name="activeMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={240}
              value={meal.activeMinutes}
              onChange={(event) => set("activeMinutes", Number(event.target.value))}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Total min</span>
            <input
              name="totalMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              value={meal.totalMinutes}
              onChange={(event) => set("totalMinutes", Number(event.target.value))}
              className={field}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Main protein</span>
          <select
            name="proteinFocus"
            value={meal.proteinFocus}
            onChange={(event) => set("proteinFocus", event.target.value as ProteinFocus)}
            className={field}
          >
            {PROTEIN_FOCUS.map((protein) => (
              <option key={protein} value={protein}>
                {protein === "mixed" ? "Mixed / none" : protein.charAt(0).toUpperCase() + protein.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <IngredientPicker
          name="core"
          label="Needs"
          hint="What it can't do without — these decide the shopping list."
          value={meal.coreIngredients}
          onChange={(next) => set("coreIngredients", next)}
          suggestions={suggestions}
        />
        <IngredientPicker
          name="flex"
          label="Nice to have"
          hint="Improves it, but it works without."
          value={meal.flexIngredients ?? []}
          onChange={(next) => set("flexIngredients", next)}
          suggestions={suggestions}
        />

        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="batchFriendly"
              checked={meal.batchFriendly}
              onChange={(event) => set("batchFriendly", event.target.checked)}
            />
            Makes leftovers for lunch
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="freezerFriendly"
              checked={meal.freezerFriendly}
              onChange={(event) => set("freezerFriendly", event.target.checked)}
            />
            Freezes well
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Steps</span>
          <span className="text-xs text-muted-foreground">Optional — one per line.</span>
          <textarea
            name="steps"
            defaultValue={(meal.steps ?? []).join("\n")}
            className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {state?.problems && (
          <ul className="rounded-lg border border-dashed p-3 text-sm">
            {state.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save meal"}
        </Button>
      </form>
    </div>
  );
}
