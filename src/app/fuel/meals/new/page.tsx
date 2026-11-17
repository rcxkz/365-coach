import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAnthropic } from "@/ai/client";
import { MealForm } from "@/components/meal-form";
import { getMealDefinition, listCustomIngredients } from "@/data/repos/fuel";
import { INGREDIENTS, type UserMealInput } from "@/domain/meals";

export const dynamic = "force-dynamic";

/**
 * A button here drafts the meal with the coach — model calls that take tens of
 * seconds. Server actions inherit the page's limit, and the platform
 * default cut planning off part-way (the nightly cron hit the same
 * thing on 31 July), so the ceiling is stated rather than inherited.
 */
export const maxDuration = 300;

export const metadata = { title: "Add a meal" };

const BLANK: UserMealInput = {
  name: "",
  description: "",
  slots: ["dinner"],
  activeMinutes: 15,
  totalMinutes: 30,
  proteinFocus: "mixed",
  coreIngredients: [],
  flexIngredients: [],
  batchFriendly: false,
  freezerFriendly: false,
  steps: [],
};

export default async function NewMealPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [source, custom] = await Promise.all([
    from ? getMealDefinition(from) : null,
    listCustomIngredients(),
  ]);
  const initial: UserMealInput = source
    ? {
        ...source,
        name: `${source.name} (mine)`,
        flexIngredients: source.flexIngredients ?? [],
        steps: source.steps,
      }
    : BLANK;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/fuel/meals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Meals
      </Link>
      <header className="mt-4 mb-6">
        <p className="eyebrow">{source ? "Copy & tweak" : "Add a meal"}</p>
        <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight">
          {source ? source.name : "Something you cook"}
        </h1>
      </header>
      <MealForm
        initial={initial}
        suggestions={[...INGREDIENTS, ...custom.map((row) => row.key)]}
        aiAvailable={!source && getAnthropic() !== null}
      />
    </main>
  );
}
