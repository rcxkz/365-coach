import { generateDay } from "../src/ai/generate-day";
import { getWorkoutByDate } from "../src/data/repos/workouts";
import { addDaysISO, todayInTimeZone } from "../src/domain/dates";

/**
 * Generates the plan for a date (default: tomorrow) — the same durable
 * artifact the in-app button produces. Future cron entrypoint.
 *
 *   npm run plan            # tomorrow
 *   npm run plan 2026-07-28 # explicit date
 */
async function main() {
  const target = process.argv[2] ?? addDaysISO(todayInTimeZone(), 1);
  console.log(`Planning ${target}...`);
  const result = await generateDay(target);
  if (!result.ok) {
    console.error(`Generation failed: ${result.reason}`);
    process.exit(1);
  }
  const workout = await getWorkoutByDate(target);
  console.log(`Planned: ${result.title}`);
  for (const exercise of workout?.exercises ?? []) {
    console.log(
      `  - ${exercise.name} ${exercise.targetSets}×${exercise.targetReps}${exercise.targetWeightKg ? ` @${exercise.targetWeightKg}kg` : ""}${exercise.inShortVersion ? " [short]" : ""}`,
    );
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
