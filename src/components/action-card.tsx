import Link from "next/link";
import {
  ChevronRight,
  Check,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { completeAction, rateMeal, reopenAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { TodayAction } from "@/data/repos/today";
import { cn } from "@/lib/utils";

/**
 * Which part of life this belongs to — real information, so it's
 * labelled rather than decorated. Set in mono so the labels stack into
 * a column down the left of the day.
 */
const DOMAIN_LABEL: Record<string, string> = {
  fitness: "train",
  fuel: "eat",
  money: "money",
  mission: "build",
  general: "note",
};

function ActionBody({ action }: { action: TodayAction }) {
  const done = action.status === "done";
  return (
    <div className="min-w-0 flex-1">
      <p
        className={cn(
          "figure text-[0.625rem] uppercase tracking-[0.16em]",
          done ? "text-muted-foreground/50" : "text-muted-foreground",
        )}
      >
        {DOMAIN_LABEL[action.domain] ?? action.domain}
      </p>
      <p
        className={cn(
          "mt-0.5 leading-snug",
          done ? "text-muted-foreground line-through" : "font-medium",
        )}
      >
        {action.title}
      </p>
      {action.detail && !done && (
        <p className="mt-0.5 text-sm text-muted-foreground">{action.detail}</p>
      )}
      {action.rationale && !done && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground/75">
          {action.rationale}
        </p>
      )}
    </div>
  );
}

/**
 * One action on the Today list. Workout actions link into the workout
 * screen (completion happens there); everything else completes with a
 * single tap, and a done action can be quietly reopened.
 */
export function ActionCard({
  action,
  workoutSummary,
}: {
  action: TodayAction;
  workoutSummary?: string | null;
}) {
  if (action.kind === "workout") {
    return (
      <Link
        href="/workout"
        className="flex items-start gap-3 py-4 transition-colors hover:bg-foreground/[0.02]"
        aria-label={`Open workout: ${action.title}`}
      >
        <div className="min-w-0 flex-1">
          <ActionBody action={action} />
          {/* Meta sits under the title so a long session name can breathe. */}
          <p className="figure mt-1.5 text-xs text-muted-foreground">
            {action.status === "done" ? (
              <span className="text-signal-go">session logged</span>
            ) : (
              workoutSummary
            )}
          </p>
        </div>
        <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  const done = action.status === "done";
  return (
    <div className="py-4">
      <div className="flex items-start gap-3">
        <ActionBody action={action} />
        <form className="shrink-0 pt-2">
          <Button
            formAction={
              done
                ? reopenAction.bind(null, action.id)
                : completeAction.bind(null, action.id)
            }
            variant={done ? "ghost" : "outline"}
            size="sm"
            type="submit"
            aria-label={done ? `Reopen: ${action.title}` : `Mark done: ${action.title}`}
          >
            {done ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {done ? "Undo" : "Done"}
          </Button>
        </form>
      </div>

      {/* Asked here rather than on the Fuel screen, because this is where
          the meal actually gets ticked off. Optional — the cook is
          already recorded; this is only the preference. */}
      {done && action.mealId && (
        <form className="mt-2 flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">
            Worth making again?
          </span>
          <Button
            formAction={rateMeal.bind(null, action.mealId, true)}
            variant="ghost"
            size="sm"
            type="submit"
            aria-label={`Make ${action.title} again`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            formAction={rateMeal.bind(null, action.mealId, false)}
            variant="ghost"
            size="sm"
            type="submit"
            aria-label={`Don't suggest ${action.title} again`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </Button>
        </form>
      )}
    </div>
  );
}
