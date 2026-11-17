import { todayInTimeZone } from "../src/domain/dates";
import { seedDay } from "../src/data/seed";
import { syncLibraries } from "../src/data/sync";

async function main() {
  const synced = await syncLibraries();
  console.log(
    `Libraries synced: ${synced.exercises} exercises, ${synced.meals} meals.`,
  );

  const date = todayInTimeZone();
  const created = await seedDay(date);
  console.log(
    created
      ? `Seeded starter block for ${date}.`
      : `${date} already has a workout — nothing to do.`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
