import { describe, expect, it } from "vitest";
import { fitnessVoice } from "./fitness";
import { fuelVoice } from "./fuel";
import { BEHAVIOURAL_CORE } from "../behavioural-core";
import { DEFAULT_PROFILE, normaliseProfile } from "@/domain/profile";

describe("voices built from the setup", () => {
  it("carry the user's own answers", () => {
    const profile = normaliseProfile({
      name: "Sam",
      training: { experience: "new", returning: true, sessionMinutes: 45 },
      protect: ["lower_back"],
      food: { diet: ["vegan", "gluten_free"], householdSize: 3, habit: "snacking" },
    });
    const fitness = fitnessVoice(profile);
    expect(fitness).toMatch(/new to structured training/);
    expect(fitness).toMatch(/returning after time away/);
    expect(fitness).toMatch(/about 45 minutes/);
    expect(fitness).toMatch(/look after: lower back/);
    expect(fitness).toMatch(/called Sam/);

    const fuel = fuelVoice(profile);
    expect(fuel).toMatch(/Dietary rules: vegan, gluten-free/);
    expect(fuel).toMatch(/Cooks for 3/);
    expect(fuel).toMatch(/Snacking is the behaviour to beat/);
  });

  it("say nothing personal by default — no one person baked in", () => {
    const text = [BEHAVIOURAL_CORE, fitnessVoice(DEFAULT_PROFILE), fuelVoice(DEFAULT_PROFILE)].join("\n");
    for (const personal of [/lactose/i, /girlfriend/i, /deliveroo/i, /hypermobile/i, /100kg/i, /wrist/i, /football/i, /2–3 years/]) {
      expect(text).not.toMatch(personal);
    }
    expect(fuelVoice(DEFAULT_PROFILE)).not.toMatch(/behaviour to beat/);
  });
});
