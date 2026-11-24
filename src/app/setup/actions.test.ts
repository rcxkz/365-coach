import { describe, expect, it, vi } from "vitest";
import { getProfile, saveProfile } from "@/data/repos/profile";
import { DEFAULT_PROFILE } from "@/domain/profile";

vi.mock("@/lib/require-session", () => ({ requireSession: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { saveSetup } = await import("./actions");

function setupForm(fields: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) form.append(key, v);
  }
  return form;
}

describe("saveSetup", () => {
  it("keeps the journal's custom trackers and hidden questions", async () => {
    await saveProfile({
      ...DEFAULT_PROFILE,
      journal: {
        hidden: ["digestion"],
        custom: [{ id: "steps", label: "Steps", kind: "number", unit: "" }],
      },
    });

    await expect(
      saveSetup(
        setupForm({
          modules: ["train"],
          plan: "full_body",
          experience: "some",
          returning: "no",
          daysPerWeek: "3",
          sessionMinutes: "45",
          equipment: "home",
          householdSize: "1",
          habit: "none",
        }),
      ),
    ).rejects.toThrow("redirect:/?setup=done");

    const { profile } = await getProfile();
    expect(profile.training.plan).toBe("full_body");
    expect(profile.modules).toEqual({ train: true, fuel: false, journal: false });
    expect(profile.journal.hidden).toEqual(["digestion"]);
    expect(profile.journal.custom.map((t) => t.id)).toEqual(["steps"]);
  });

  it("sends an empty choice of parts back rather than saving it", async () => {
    await expect(saveSetup(setupForm({ plan: "rebuild" }))).rejects.toThrow("redirect:/setup?pick=1");
  });
});
