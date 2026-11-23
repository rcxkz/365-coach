import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { removeMeal } from "../actions";
import { MealForm } from "@/components/meal-form";
import { Button } from "@/components/ui/button";
import { getMeal, getMealDefinition, listCustomIngredients } from "@/data/repos/fuel";
import { INGREDIENTS, USER_MEAL_PREFIX } from "@/domain/meals";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit meal" };

export default async function EditMealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id.startsWith(USER_MEAL_PREFIX)) notFound();
  const [row, meal, custom] = await Promise.all([
    getMeal(id),
    getMealDefinition(id),
    listCustomIngredients(),
  ]);
  if (!row || !meal || row.archivedAt) notFound();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/fuel/meals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Meals
      </Link>
      <header className="mt-4 mb-6">
        <p className="eyebrow">Your meal</p>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
          {meal.name}
        </h1>
      </header>
      <MealForm
        id={meal.id}
        initial={{ ...meal, flexIngredients: meal.flexIngredients ?? [] }}
        suggestions={[...INGREDIENTS, ...custom.map((item) => item.key)]}
        aiAvailable={false}
      />
      <form className="mt-8 border-t border-border pt-4">
        <Button formAction={removeMeal.bind(null, meal.id)} variant="outline" size="sm" type="submit">
          Remove this meal
        </Button>
      </form>
    </main>
  );
}
