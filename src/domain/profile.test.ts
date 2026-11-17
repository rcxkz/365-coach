import { describe, expect, it } from "vitest";
import { MEAL_LIBRARY } from "../data/library/meals";
import {
  availableEquipment,
  DEFAULT_PROFILE,
  mealFitsDiet,
  normaliseProfile,
  weeklyCeilingReached,
} from "./profile";

describe("normaliseProfile", () => {
  it("fills gaps from the defaults and drops nonsense", () => {
    const profile = normaliseProfile({
      name: "  Sam ",
      modules: { fuel: false },
      training: { daysPerWeek: 12, sessionMinutes: 50, equipment: "spaceship" },
      protect: ["wrist", "wrist", "tail"],
      food: { diet: ["vegan", "keto"], householdSize: 0 },
    });
    expect(profile).toEqual({
      ...DEFAULT_PROFILE,
      name: "Sam",
      modules: { train: true, fuel: false, journal: true },
      training: { ...DEFAULT_PROFILE.training, daysPerWeek: 7 },
      protect: ["wrist"],
      food: { diet: ["vegan"], householdSize: 1, habit: "none" },
    });
  });

  it("survives garbage", () => {
    expect(normaliseProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(normaliseProfile("x")).toEqual(DEFAULT_PROFILE);
  });
});

describe("availableEquipment", () => {
  it("leaves a full gym unrestricted and narrows the rest", () => {
    expect(availableEquipment("full_gym")).toBeNull();
    expect(availableEquipment("bodyweight")).not.toContain("barbell");
    expect(availableEquipment("home")).toContain("dumbbell");
  });
});

describe("mealFitsDiet", () => {
  const byId = new Map(MEAL_LIBRARY.map((meal) => [meal.id, meal]));
  it("keeps everything with no rules", () => {
    expect(MEAL_LIBRARY.every((meal) => mealFitsDiet(meal, []))).toBe(true);
  });

  it("vegetarian drops meat and fish, keeps plant meals", () => {
    const veg = MEAL_LIBRARY.filter((meal) => mealFitsDiet(meal, ["vegetarian"]));
    expect(veg.length).toBeGreaterThan(3);
    expect(veg.some((meal) => meal.proteinFocus === "chicken")).toBe(false);
    expect(mealFitsDiet(byId.get("lentil_bolognese")!, ["vegetarian"])).toBe(true);
  });

  it("vegan also drops eggs", () => {
    expect(
      MEAL_LIBRARY.filter((meal) => mealFitsDiet(meal, ["vegan"])).some((meal) =>
        meal.coreIngredients.includes("eggs"),
      ),
    ).toBe(false);
  });
});

describe("weeklyCeilingReached", () => {
  it("counts this week's trained days before the target, as a ceiling", () => {
    const trained = ["2026-11-09", "2026-11-11", "2026-11-12", "2026-11-05"];
    // Week of Mon 9 Nov: three trained days before Friday 13th.
    expect(weeklyCeilingReached(trained, "2026-11-09", "2026-11-13", 3)).toBe(true);
    expect(weeklyCeilingReached(trained, "2026-11-09", "2026-11-13", 4)).toBe(false);
    // Last week's session doesn't count; a new week starts fresh.
    expect(weeklyCeilingReached(trained, "2026-11-16", "2026-11-16", 1)).toBe(false);
  });
});

describe("normaliseProfile — journal trackers", () => {
  it("keeps valid trackers, drops bad and duplicate ones, caps the list", () => {
    const profile = normaliseProfile({
      journal: {
        hidden: ["digestion", "nonsense"],
        custom: [
          { id: "steps", label: " Steps ", kind: "number", unit: "steps" },
          { id: "steps", label: "Dupe", kind: "scale" },
          { id: "Bad Id", label: "x", kind: "scale" },
          { id: "headache", label: "Headache", kind: "weird" },
          ...Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `T${i}`, kind: "yesno" })),
        ],
      },
    });
    expect(profile.journal.hidden).toEqual(["digestion"]);
    expect(profile.journal.custom[0]).toEqual({ id: "steps", label: "Steps", kind: "number", unit: "steps" });
    expect(profile.journal.custom[1]).toMatchObject({ id: "headache", kind: "scale" });
    expect(profile.journal.custom).toHaveLength(8);
  });
});
