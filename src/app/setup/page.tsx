import { saveSetup } from "./actions";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/data/repos/profile";
import { BODY_AREAS } from "@/domain/exercises";
import { PLAN_STYLES, PLANS } from "@/domain/templates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your setup" };

type Option = { value: string; label: string };

function Chips({
  name,
  options,
  checked,
  multiple = false,
}: {
  name: string;
  options: Option[];
  checked: string[];
  multiple?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label key={option.value}>
          <input
            type={multiple ? "checkbox" : "radio"}
            name={name}
            value={option.value}
            defaultChecked={checked.includes(option.value)}
            className="peer sr-only"
          />
          <span className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

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

const area = (key: string) => key.replace(/_/g, " ");

/**
 * Setup (Phase 15): the handful of answers that make the app yours —
 * a couple of minutes, all taps. Every answer can be changed later from
 * Settings, and nothing here is required: the defaults are sensible.
 */
export default async function SetupPage() {
  const { profile, isSetUp } = await getProfile();
  const modules = Object.entries(profile.modules)
    .filter(([, on]) => on)
    .map(([key]) => key);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <header className="mb-6">
        <p className="eyebrow">{isSetUp ? "Your setup" : "Welcome"}</p>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
          {isSetUp ? "Change anything" : "Make it yours"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A couple of minutes, all taps. The coach plans around these answers,
          and you can change any of them later in Settings.
        </p>
      </header>

      <form action={saveSetup} className="flex flex-col gap-8 pb-8">
        <section className="flex flex-col gap-5">
          <Question title="What should we call you?" hint="Optional.">
            <input
              name="name"
              defaultValue={profile.name}
              autoComplete="given-name"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </Question>
          <Question title="What do you want help with?" hint="Switch off anything you don't need — it disappears.">
            <Chips
              name="modules"
              multiple
              checked={modules}
              options={[
                { value: "train", label: "Training" },
                { value: "fuel", label: "Food" },
                { value: "journal", label: "How I feel" },
              ]}
            />
          </Question>
        </section>

        <section className="flex flex-col gap-5 border-t border-border pt-6">
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
                  <span className="block cursor-pointer rounded-md border border-input bg-background px-3 py-2.5 transition-colors peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <span className="block text-sm font-medium">{PLANS[style].label}</span>
                    <span className="block text-xs text-muted-foreground">{PLANS[style].description}</span>
                  </span>
                </label>
              ))}
            </div>
          </Question>
          <Question title="Experience">
            <Chips
              name="experience"
              checked={[profile.training.experience]}
              options={[
                { value: "new", label: "New to it" },
                { value: "some", label: "Some" },
                { value: "experienced", label: "Experienced" },
              ]}
            />
          </Question>
          <Question title="Coming back after time off?" hint="Sessions start lighter and build back up.">
            <Chips
              name="returning"
              checked={[profile.training.returning ? "yes" : "no"]}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
          </Question>
          <Question title="Days a week" hint="The most it plans — once a week has them, the rest is rest. Never a target to catch up on.">
            <Chips
              name="daysPerWeek"
              checked={[String(profile.training.daysPerWeek)]}
              options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </Question>
          <Question title="Time per session">
            <Chips
              name="sessionMinutes"
              checked={[String(profile.training.sessionMinutes)]}
              options={[30, 45, 60, 75].map((n) => ({ value: String(n), label: `${n} min` }))}
            />
          </Question>
          <Question title="Where you train">
            <Chips
              name="equipment"
              checked={[profile.training.equipment]}
              options={[
                { value: "full_gym", label: "A full gym" },
                { value: "home", label: "Home — dumbbells, bands, a bar" },
                { value: "bodyweight", label: "Bodyweight only" },
              ]}
            />
          </Question>
          <Question
            title="Anything to look after?"
            hint="Every session treats these with care — controlled range, nothing grinding. Pain on the day is logged separately."
          >
            <Chips
              name="protect"
              multiple
              checked={profile.protect}
              options={BODY_AREAS.map((key) => ({ value: key, label: area(key) }))}
            />
          </Question>
        </section>

        <section className="flex flex-col gap-5 border-t border-border pt-6">
          <h2 className="eyebrow">Food</h2>
          <Question title="Any rules?" hint="Meals that break one are never suggested.">
            <Chips
              name="diet"
              multiple
              checked={profile.food.diet}
              options={[
                { value: "dairy_free", label: "Dairy-free" },
                { value: "vegetarian", label: "Vegetarian" },
                { value: "vegan", label: "Vegan" },
                { value: "pescatarian", label: "Pescatarian" },
                { value: "gluten_free", label: "Gluten-free" },
              ]}
            />
          </Question>
          <Question title="Cooking for">
            <Chips
              name="householdSize"
              checked={[String(profile.food.householdSize)]}
              options={[1, 2, 3, 4, 5].map((n) => ({
                value: String(n),
                label: n === 1 ? "Just me" : n === 5 ? "5+" : String(n),
              }))}
            />
          </Question>
          <Question title="The habit you'd most like to beat" hint="The coach aims its suggestions here.">
            <Chips
              name="habit"
              checked={[profile.food.habit]}
              options={[
                { value: "takeaway_lunches", label: "Takeaway lunches" },
                { value: "skipping_meals", label: "Skipping meals" },
                { value: "snacking", label: "Snacking" },
                { value: "none", label: "Nothing in particular" },
              ]}
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
