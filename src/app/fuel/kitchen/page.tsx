import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { KitchenForm } from "@/components/kitchen-form";
import { listCustomIngredients, listPantry } from "@/data/repos/fuel";

export const dynamic = "force-dynamic";

export const metadata = { title: "The kitchen" };

function savedNotice(added: number, removed: number): string | null {
  if (added === 0 && removed === 0) {
    return "Saved. Anything running low is on this week's shopping list.";
  }
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} in`);
  if (removed > 0) parts.push(`${removed} out`);
  return `Kitchen updated — ${parts.join(", ")}. Tonight's suggestion and this week's list both know about it now.`;
}

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; removed?: string }>;
}) {
  const { added, removed } = await searchParams;
  const [pantry, custom] = await Promise.all([listPantry(), listCustomIngredients()]);
  const notice =
    added === undefined ? null : savedNotice(Number(added), Number(removed ?? 0));

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/fuel"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Fuel
      </Link>

      <header className="mt-4 mb-6">
        <p className="eyebrow">In the kitchen</p>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
          What&apos;s in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap everything you&apos;ve got, then save once. Nothing is assumed to
          be in until you say so. Missing something? Add it at the bottom.
        </p>
      </header>

      {notice && (
        <p className="mb-6 rounded-lg bg-secondary p-3 text-sm">{notice}</p>
      )}

      <KitchenForm
        initial={pantry.map((item) => ({
          ingredient: item.ingredient,
          runningLow: item.runningLow,
        }))}
        custom={custom.map((item) => ({ key: item.key, aisle: item.aisle }))}
      />
    </main>
  );
}
