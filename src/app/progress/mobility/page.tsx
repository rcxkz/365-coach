import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { saveMobilityScore } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLatestMetric } from "@/data/repos/metrics";
import { MOBILITY_MAX_SCORE, MOBILITY_TESTS } from "@/domain/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mobility check" };

export default async function MobilityCheckPage() {
  const previous = await getLatestMetric("mobility_score");

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/progress"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Progress
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] font-semibold leading-none tracking-tight">
          Mobility check
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Five tests, one per area, scored out of {MOBILITY_MAX_SCORE}. About
          five minutes — monthly is plenty.
          {previous && (
            <>
              {" "}
              Last time: {previous.value}/{MOBILITY_MAX_SCORE} on{" "}
              {previous.date}.
            </>
          )}
        </p>
      </header>

      <form action={saveMobilityScore} className="flex flex-col gap-4">
        {MOBILITY_TESTS.map((test) => (
          <Card key={test.id} className="py-0">
            <CardContent className="p-4">
              <p className="text-sm font-medium">{test.area}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {test.instruction}
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {test.options.map((option, score) => (
                  <label
                    key={score}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="radio"
                      name={test.id}
                      value={score}
                      defaultChecked={score === 1}
                      className="peer sr-only"
                    />
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-input peer-checked:border-primary peer-checked:bg-primary" />
                    <span className="text-sm peer-checked:font-medium">
                      {option}
                    </span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button type="submit" className="w-full">
          Save mobility score
        </Button>
      </form>
    </main>
  );
}
