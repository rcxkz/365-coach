import { Check } from "lucide-react";
import { saveSetup } from "./actions";
import { ModulePicker } from "./module-picker";
import {
  DAYS_OPTIONS,
  DIET_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  HABIT_OPTIONS,
  HOUSEHOLD_OPTIONS,
  MINUTES_OPTIONS,
  PROTECT_OPTIONS,
  RETURNING_OPTIONS,
} from "./options";
import { ChoiceChips } from "@/components/choice-chips";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/data/repos/profile";
import { DEFAULT_PROFILE } from "@/domain/profile";
import { PLAN_STYLES, PLANS } from "@/domain/templates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your setup" };

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Setup (Phase 15): the handful of answers that make the app yours —
 * a couple of minutes, all taps. Every answer can be changed later from
 * Settings, and nothing here is required: the defaults are sensible.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string; fresh?: string }>;
}) {
  const { pick, fresh } = await searchParams;
  const saved = await getProfile();
  // "Redo setup from scratch" (from Settings): the defaults and nothing
  // pre-chosen, as on a first run. Saving replaces the old answers.
  const startAgain = Boolean(fresh);
  const profile = startAgain ? DEFAULT_PROFILE : saved.profile;
  const isSetUp = saved.isSetUp && !startAgain;
  // A first setup starts with nothing chosen: you tap what you want,
  // rather than untapping what you don't (which read the wrong way round).
  const modules = isSetUp
    ? Object.entries(profile.modules)
        .filter(([, on]) => on)
        .map(([key]) => key)
    : [];

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <header className="mb-6">
        <p className="eyebrow">{isSetUp ? "Your setup" : startAgain ? "Start again" : "Welcome"}</p>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
          {isSetUp ? "Change anything" : "Make it yours"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A couple of minutes, all taps. The coach plans around these answers,
          and you can change any of them later in Settings.
        </p>
      </header>
      {pick && (
        <p role="status" className="mb-4 border border-border p-3 text-sm">
          Pick at least one part below (Training, Food or How I feel), then save.
        </p>
      )}

      <form action={saveSetup} className="flex flex-col gap-8 pb-8">
        <section id="parts" className="flex scroll-mt-6 flex-col gap-5">
          <Question title="What should we call you?" hint="Optional.">
            <input
              name="name"
              defaultValue={profile.name}
              autoComplete="given-name"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </Question>
          <Question
            title="What do you want help with?"
            hint={
              isSetUp
                ? "Switch off anything you don't need — it disappears."
                : "Tap each part you'd like. You can change it later."
            }
          >
            <ModulePicker checked={modules} />
          </Question>
        </section>

        <section id="training" className="flex scroll-mt-6 flex-col gap-5 border-t border-border pt-6">
          <h2 className="eyebrow">Training</h2>
          <Question title="Plan" hint="Sessions rotate through it in order — skip a day and nothing is lost.">
            <div className="flex flex-col gap-2">
              {PLAN_STYLES.map((style) => (
                <label key={style}>
                  <input
                    type="radio"
                    name="plan"
                    value={style}
                    defaultChecked={profile.training.plan === style}
                    className="peer sr-only"
                  />
                  <span className="flex cursor-pointer items-start gap-3 border border-input px-3 py-2.5 transition-colors hover:border-foreground/60 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring [&_.tick]:invisible peer-checked:[&_.tick]:visible [&_.desc]:text-muted-foreground peer-checked:[&_.desc]:text-primary-foreground/75">
                    <Check className="tick mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">{PLANS[style].label}</span>
                      <span className="desc block text-xs">{PLANS[style].description}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Question>
          <Question title="Experience">
            <ChoiceChips
              name="experience"
              checked={[profile.training.experience]}
              options={EXPERIENCE_OPTIONS}
            />
          </Question>
          <Question title="Coming back after time off?" hint="Sessions start lighter and build back up.">
            <ChoiceChips
              name="returning"
              checked={[profile.training.returning ? "yes" : "no"]}
              options={RETURNING_OPTIONS}
            />
          </Question>
          <Question title="Days a week" hint="The most it plans — once a week has them, the rest is rest. Never a target to catch up on.">
            <ChoiceChips
              name="daysPerWeek"
              checked={[String(profile.training.daysPerWeek)]}
              options={DAYS_OPTIONS}
            />
          </Question>
          <Question title="Time per session">
            <ChoiceChips
              name="sessionMinutes"
              checked={[String(profile.training.sessionMinutes)]}
              options={MINUTES_OPTIONS}
            />
          </Question>
          <Question title="Where you train">
            <ChoiceChips
              name="equipment"
              checked={[profile.training.equipment]}
              options={EQUIPMENT_OPTIONS}
            />
          </Question>
          <Question
            title="Anything to look after?"
            hint="Every session treats these with care — controlled range, nothing grinding. Pain on the day is logged separately."
          >
            <ChoiceChips
              name="protect"
              multiple
              checked={profile.protect}
              options={PROTECT_OPTIONS}
            />
          </Question>
        </section>

        <section id="food" className="flex scroll-mt-6 flex-col gap-5 border-t border-border pt-6">
          <h2 className="eyebrow">Food</h2>
          <Question title="Any rules?" hint="Meals that break one are never suggested.">
            <ChoiceChips
              name="diet"
              multiple
              checked={profile.food.diet}
              options={DIET_OPTIONS}
            />
          </Question>
          <Question title="Cooking for">
            <ChoiceChips
              name="householdSize"
              checked={[String(profile.food.householdSize)]}
              options={HOUSEHOLD_OPTIONS}
            />
          </Question>
          <Question title="The habit you'd most like to beat" hint="The coach aims its suggestions here.">
            <ChoiceChips
              name="habit"
              checked={[profile.food.habit]}
              options={HABIT_OPTIONS}
            />
          </Question>
        </section>

        <Button type="submit" className="w-full">
          {isSetUp ? "Save" : "That's me — start"}
        </Button>
      </form>
    </main>
  );
}
