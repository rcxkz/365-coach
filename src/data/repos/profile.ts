import { eq } from "drizzle-orm";
import { DEFAULT_PROFILE, normaliseProfile, type Profile } from "../../domain/profile";
import { getDb } from "../db";
import { profile } from "../schema";

const ROW_ID = 1;

/**
 * The user's setup, or the defaults when they haven't been through it
 * yet. `isSetUp` lets Today invite them to do it once.
 */
export async function getProfile(): Promise<{ profile: Profile; isSetUp: boolean }> {
  const db = await getDb();
  const [row] = await db.select().from(profile).where(eq(profile.id, ROW_ID)).limit(1);
  return row
    ? { profile: normaliseProfile(row.data), isSetUp: true }
    : { profile: DEFAULT_PROFILE, isSetUp: false };
}

export async function saveProfile(input: unknown): Promise<Profile> {
  const value = normaliseProfile(input);
  const db = await getDb();
  await db
    .insert(profile)
    .values({ id: ROW_ID, data: value })
    .onConflictDoUpdate({ target: profile.id, set: { data: value, updatedAt: new Date() } });
  return value;
}
