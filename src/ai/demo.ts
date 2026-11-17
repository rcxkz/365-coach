import { generateDay } from "./generate-day";
import { generateWeeklyReview } from "./generate-review";
import { generateWeekPlan } from "./generate-week-plan";
import { upsertCheckin } from "@/data/repos/checkins";
import { addCustomIngredient, recordMealFeedback, saveUserMeal, setPantry } from "@/data/repos/fuel";
import { addJournalEntry } from "@/data/repos/journal";
import { addMemory } from "@/data/repos/memories";
import { getProfile, saveProfile } from "@/data/repos/profile";
import { listShoppingList, markWeekMealCooked, setShoppingStatus } from "@/data/repos/week-plan";
import { createWorkout, logSets } from "@/data/repos/workouts";
import { resetAllData } from "@/data/reset";
import { syncLibraries } from "@/data/sync";
import { addDaysISO, startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { buildUserMeal } from "@/domain/meals";
import { defaultRepsFor } from "@/domain/targets";
import { EXERCISE_LIBRARY } from "@/data/library";
import { buildSessionCandidates } from "@/domain/candidates";
import { composeFallbackSession } from "@/domain/fallback-plan";
import { availableEquipment, weeklyCeilingReached } from "@/domain/profile";
import { pickNextSession } from "@/domain/rotation";
import { PLANS, TEMPLATES_BY_ID } from "@/domain/templates";

/**
 * The public demo's made-up person (Phase 16): Alex, back in the gym
 * after a year off, on an upper/lower plan four days a week, looking
 * after a lower back and a knee, pescatarian, cooking for two. Two weeks
 * of lived-in history so every screen has something real to show —
 * built through the same planners a real user's days go through.
 *
 * Erases everything first (resetAllData refuses outside the demo).
 */
export async function buildDemo(today: string = todayInTimeZone()): Promise<void> {
  await resetAllData();
  await syncLibraries();

  await saveProfile({
    name: "Alex",
    modules: { train: true, fuel: true, journal: true },
    training: {
      plan: "upper_lower",
      experience: "some",
      returning: true,
      daysPerWeek: 4,
      sessionMinutes: 45,
      equipment: "full_gym",
    },
    protect: ["lower_back", "knee"],
    food: { diet: ["pescatarian"], householdSize: 2, habit: "takeaway_lunches" },
    journal: {
      hidden: ["digestion"],
      custom: [
        { id: "steps", label: "Steps", kind: "number", unit: "" },
        { id: "slept_well", label: "Slept well", kind: "yesno", unit: "" },
      ],
    },
  });

  await addMemory({
    tier: "long_term",
    domain: "fitness",
    content: "Used to run 5k regularly; wants to get back to it alongside strength.",
  });
  await addMemory({
    tier: "long_term",
    domain: "fitness",
    content: "Lower back tightens after long desk days — warm the hips up first.",
  });

  await addCustomIngredient("feta_style_cheese", "produce");
  await setPantry([
    "rice", "pasta", "noodles", "potatoes", "tinned_tomatoes", "chickpeas", "olive_oil",
    "soy_sauce", "garlic", "onions", "frozen_veg", "lemon", "salmon", "feta_style_cheese",
    { ingredient: "eggs", runningLow: true },
    { ingredient: "oat_milk", runningLow: true },
  ]);

  const ownMeal = buildUserMeal(
    {
      name: "Chickpea and spinach curry",
      description: "One pot, mostly simmering — doubles easily for lunch.",
      slots: ["dinner", "lunch"],
      activeMinutes: 12,
      totalMinutes: 35,
      proteinFocus: "legumes",
      coreIngredients: ["chickpeas", "spinach", "tinned_tomatoes", "curry_paste", "onions"],
      flexIngredients: ["coconut_milk", "rice"],
      batchFriendly: true,
      freezerFriendly: true,
      steps: ["Soften the onion.", "Add curry paste, then chickpeas and tomatoes.", "Simmer 20 minutes, stir in spinach."],
    },
    "my_chickpea_spinach_curry_demo",
  );
  if (ownMeal.ok) await saveUserMeal(ownMeal.meal);

  // Two weeks of days, planned in memory with the same pure functions
  // the planner uses — rotation, candidate gates, the weekly ceiling —
  // then written in a few bulk inserts. Going through the full planner
  // per day took dozens of database round trips each and ran past the
  // free plan's function time limit, leaving a half-built demo.
  const setup = (await getProfile()).profile;
  const rotation = PLANS[setup.training.plan].rotation;
  const recentKeys: string[] = [];
  const trained: string[] = [];
  const moods = [4, 3, 4, 2, 3, 4, 5, 3, 4, 3, 2, 4, 4];
  for (let back = 13; back >= 1; back--) {
    const date = addDaysISO(today, -back);
    const i = 13 - back;
    const resting = weeklyCeilingReached(
      trained,
      startOfWeekISO(date),
      date,
      setup.training.daysPerWeek,
    );
    if (!resting) {
      const entry = pickNextSession(rotation, recentKeys, "green");
      const template = TEMPLATES_BY_ID.get(entry.templateId)!;
      const exercises = composeFallbackSession(
        template,
        buildSessionCandidates(template, EXERCISE_LIBRARY, {
          painFlags: [],
          readiness: "green",
          availableEquipment: availableEquipment(setup.training.equipment),
          protectAreas: setup.protect,
        }),
      );
      // One session skipped on a busy day — real weeks have those.
      const skipped = back === 6;
      const workout = await createWorkout({
        date,
        title: entry.label,
        focus: template.purpose,
        rationale: "Next up in your rotation — planned from your block, ready to go.",
        durationMinutes: setup.training.sessionMinutes,
        rotationKey: entry.key,
        templateId: template.id,
        status: skipped ? "skipped" : "completed",
        exercises,
      });
      if (!skipped) {
        // Most sets hit the target; every third exercise falls a rep short
        // on the last set — so the review has both kinds of call to make.
        await logSets(
          workout.exercises.flatMap((exercise, index) => {
            const reps = defaultRepsFor(exercise.targetReps);
            return Array.from({ length: exercise.targetSets }, (_, n) => ({
              exerciseId: exercise.id,
              setNumber: n + 1,
              reps: index % 3 === 2 && n + 1 === exercise.targetSets ? Math.max(1, reps - 1) : reps,
              weightKg: exercise.targetWeightKg ?? null,
            }));
          }),
        );
        trained.push(date);
        recentKeys.unshift(entry.key);
      }
    }
    await upsertCheckin(date, {
      energy: moods[i] <= 2 ? "low" : "normal",
      sleep: i % 5 === 3 ? "poor" : "normal",
      soreness: i % 4 === 1 ? "mild" : "none",
    });
    await addJournalEntry({
      date,
      mood: moods[i],
      stress: moods[i] <= 2 ? "high" : i % 3 === 0 ? "medium" : "low",
      energy: moods[i] >= 4 ? "high" : moods[i] <= 2 ? "low" : "normal",
      custom: { steps: 6000 + ((i * 1371) % 6000), slept_well: i % 5 !== 3 },
    });
  }

  await recordMealFeedback({
    mealId: "my_chickpea_spinach_curry_demo",
    cookedOn: addDaysISO(today, -4),
    makeAgain: true,
  });

  // This week's food: planned, part cooked, part shopped.
  const weekStart = startOfWeekISO(today);
  const week = await generateWeekPlan(weekStart, { dinners: 4, lunches: 1 });
  const firstDinner = week.meals.find((row) => row.slot === "dinner");
  if (firstDinner && today > weekStart) {
    await markWeekMealCooked(weekStart, firstDinner.mealId, weekStart);
  }
  for (const item of (await listShoppingList(weekStart)).slice(0, 2)) {
    await setShoppingStatus(item.id, "bought");
  }

  await generateWeeklyReview(startOfWeekISO(addDaysISO(today, -7)));
  await generateDay(today);
}
