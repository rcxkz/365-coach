import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "../../domain/profile";
import { getProfile, saveProfile } from "./profile";

describe("profile repo", () => {
  it("starts unset with defaults, then holds one normalised profile", async () => {
    expect(await getProfile()).toEqual({ profile: DEFAULT_PROFILE, isSetUp: false });
    await saveProfile({ name: "Ryk", protect: ["wrist", "nope"], food: { diet: ["vegan"] } });
    await saveProfile({ name: "Ryk", protect: ["wrist"], food: { diet: ["dairy_free"] } });
    const { profile, isSetUp } = await getProfile();
    expect(isSetUp).toBe(true);
    expect(profile.protect).toEqual(["wrist"]);
    expect(profile.food.diet).toEqual(["dairy_free"]);
  });
});
