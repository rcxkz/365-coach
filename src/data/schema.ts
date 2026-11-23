import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  BODY_REGIONS,
  EXERCISE_CATEGORIES,
  MOVEMENT_PATTERNS,
} from "../domain/exercises";
import { PAUSE_REASONS } from "../domain/comeback";
import { DIGESTION_STATES, STRESS_LEVELS } from "../domain/journal";
import { AISLES } from "../domain/meals";
import { CHECKIN_SLEEP, CHECKIN_SORENESS } from "../domain/readiness";

/**
 * Life domains shared by memories and today actions (playbook doc 09).
 *
 * `money` stays in the vocabulary even though the Money screen was
 * removed (doc 05, descoped 30 July 2026): money is still one of the
 * user's life areas, so a memory or a one-off action can belong to it.
 * Postgres can't drop an enum value in place, and there's nothing to
 * gain from the rewrite.
 */
export const lifeDomain = pgEnum("life_domain", [
  "fitness",
  "fuel",
  "money",
  "mission",
  "general",
]);

/** Memory tiers per playbook doc 09 (Memory Model). */
export const memoryTier = pgEnum("memory_tier", [
  "long_term",
  "active",
  "temporary",
]);

export const memoryStatus = pgEnum("memory_status", ["active", "archived"]);

export const workoutStatus = pgEnum("workout_status", [
  "planned",
  "completed",
  "skipped",
]);

export const checkinEnergy = pgEnum("checkin_energy", [
  "low",
  "normal",
  "high",
]);

export const checkinSleep = pgEnum("checkin_sleep", [...CHECKIN_SLEEP]);
export const checkinSoreness = pgEnum("checkin_soreness", [
  ...CHECKIN_SORENESS,
]);

export const actionKind = pgEnum("action_kind", [
  "workout",
  "food",
  "project",
  "reminder",
  "checkin",
]);

export const actionStatus = pgEnum("action_status", [
  "pending",
  "done",
  "skipped",
  "moved",
]);

export type LifeDomain = (typeof lifeDomain.enumValues)[number];
export type MemoryTier = (typeof memoryTier.enumValues)[number];
export type MemoryStatus = (typeof memoryStatus.enumValues)[number];
export type WorkoutStatus = (typeof workoutStatus.enumValues)[number];
export type CheckinEnergy = (typeof checkinEnergy.enumValues)[number];
export type CheckinSleepValue = (typeof checkinSleep.enumValues)[number];
export type CheckinSorenessValue = (typeof checkinSoreness.enumValues)[number];
export type ActionKind = (typeof actionKind.enumValues)[number];
export type ActionStatus = (typeof actionStatus.enumValues)[number];

export const exerciseCategory = pgEnum("exercise_category", [
  ...EXERCISE_CATEGORIES,
]);
export const movementPattern = pgEnum("movement_pattern", [
  ...MOVEMENT_PATTERNS,
]);
export const bodyRegion = pgEnum("body_region", [...BODY_REGIONS]);

/**
 * Global exercise library (Phase 2 design §1). Definitions are shared
 * data seeded from `src/data/library`; the freeform text[] vocabularies
 * (equipment, areas, goals…) are validated in code, not the database.
 */
export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull(),
  category: exerciseCategory("category").notNull(),
  movementPattern: movementPattern("movement_pattern").notNull(),
  bodyRegion: bodyRegion("body_region").notNull(),
  equipment: text("equipment").array().notNull(),
  attributes: text("attributes").array().notNull(),
  goals: text("goals").array().notNull(),
  difficulty: integer("difficulty").notNull(),
  riskLevel: integer("risk_level").notNull(),
  avoidAreas: text("avoid_areas").array().notNull(),
  cautionAreas: text("caution_areas").array().notNull(),
  recoveryCost: integer("recovery_cost").notNull(),
  setsMin: integer("sets_min").notNull(),
  setsMax: integer("sets_max").notNull(),
  repsTarget: text("reps_target").notNull(),
  restSeconds: integer("rest_seconds").notNull(),
  placements: text("placements").array().notNull(),
  progressions: text("progressions").array().notNull(),
  regressions: text("regressions").array().notNull(),
  substitutions: text("substitutions").array().notNull(),
  cues: text("cues").notNull(),
});

/** Per-user state layered over the global library (Phase 2 design §1). */
export const exerciseUserState = pgTable("exercise_user_state", {
  exerciseId: text("exercise_id")
    .primaryKey()
    .references(() => exercises.id, { onDelete: "cascade" }),
  /** −2 (strongly dislikes) … +2 (strongly likes). */
  preference: integer("preference").notNull().default(0),
  lastPerformedAt: timestamp("last_performed_at", { withTimezone: true }),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  tier: memoryTier("tier").notNull(),
  domain: lifeDomain("domain").notNull().default("general"),
  content: text("content").notNull(),
  status: memoryStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
});

export const workouts = pgTable(
  "workouts",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    status: workoutStatus("status").notNull().default("planned"),
    title: text("title").notNull(),
    focus: text("focus"),
    // Which rotation slot (doc 13 A-F) and template produced this
    // session; drives least-recently-done selection. Null on pre-P2 rows.
    rotationKey: text("rotation_key"),
    templateId: text("template_id"),
    // Brief "why this workout" shown to the user (doc 10: Explain Why).
    rationale: text("rationale"),
    durationMinutes: integer("duration_minutes"),
    // Which session back after a gap or illness this was (1..3), so the
    // screen can say so and the first one back can be marked. Null on
    // ordinary sessions.
    returnSession: integer("return_session"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("workouts_date_unique").on(table.date)],
);

export const workoutExercises = pgTable("workout_exercises", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id")
    .notNull()
    .references(() => workouts.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  // Links generated plans to the library so progression decisions are a
  // join, not name-matching. Null on pre-library rows.
  libraryExerciseId: text("library_exercise_id").references(
    () => exercises.id,
    { onDelete: "set null" },
  ),
  targetSets: integer("target_sets").notNull(),
  // Text so ranges like "8-10" or "30s hold" stay expressible.
  targetReps: text("target_reps").notNull(),
  targetWeightKg: real("target_weight_kg"),
  // Marks exercises that survive the shortened session variant (doc 02).
  inShortVersion: boolean("in_short_version").notNull().default(false),
  // False when the user shortens today's session; reversible, never deleted.
  included: boolean("included").notNull().default(true),
  note: text("note"),
});

export const setLogs = pgTable(
  "set_logs",
  {
    id: serial("id").primaryKey(),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    reps: integer("reps").notNull(),
    weightKg: real("weight_kg"),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("set_logs_exercise_set_unique").on(
      table.exerciseId,
      table.setNumber,
    ),
  ],
);

export const painFlags = pgTable("pain_flags", {
  id: serial("id").primaryKey(),
  location: text("location").notNull(),
  /** 1 (mild) to 5 (severe); validated at the repository boundary. */
  severity: integer("severity").notNull(),
  aggravatingMovement: text("aggravating_movement"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const dailyCheckins = pgTable(
  "daily_checkins",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    energy: checkinEnergy("energy").notNull(),
    // Nullable: historical rows predate check-in v2 (Phase 2 design §2).
    // Pain lives in pain_flags only — one pain system (decision D10).
    sleep: checkinSleep("sleep"),
    soreness: checkinSoreness("soreness"),
    timeAvailableMinutes: integer("time_available_minutes"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("daily_checkins_date_unique").on(table.date)],
);

/**
 * Mission Control (Phase 4 design, doc 06). Removed from the app on
 * 23 October 2026; the tables and their data are kept, unused, so
 * nothing the user wrote is lost (doc 06 descope note).
 */
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mission: text("mission"),
  definitionOfSuccess: text("definition_of_success"),
  status: text("status").notNull().default("active"),
  currentMilestone: text("current_milestone"),
  /** Open blocker; while set, the project takes no daily actions. */
  blocker: text("blocker"),
  /** Named collaborator — projects aren't all solely owned (doc 06). */
  sharedWith: text("shared_with"),
  lastProgressOn: date("last_progress_on"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Captured thoughts. Raw wording is never rewritten (doc 06). */
export const projectIdeas = pgTable("project_ideas", {
  id: serial("id").primaryKey(),
  /** Null is valid and expected — an idea needn't have a home yet. */
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  rawText: text("raw_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const projectActions = pgTable("project_actions", {
  id: serial("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  detail: text("detail"),
  estimatedMinutes: integer("estimated_minutes"),
  status: text("status").notNull().default("suggested"),
  /** What actually happened — kept when partial, so work isn't lost. */
  outcome: text("outcome"),
  suggestedOn: date("suggested_on").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

/**
 * Meal library (Phase 3 design, doc 04). Global definitions, seeded
 * from src/data/library/meals.ts — data, not prompts. Every meal is
 * dairy-free by construction.
 */
export const meals = pgTable("meals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  slots: text("slots").array().notNull(),
  activeMinutes: integer("active_minutes").notNull(),
  totalMinutes: integer("total_minutes").notNull(),
  attention: text("attention").notNull(),
  methods: text("methods").array().notNull(),
  coreIngredients: text("core_ingredients").array().notNull(),
  flexIngredients: text("flex_ingredients").array().notNull(),
  proteinFocus: text("protein_focus").notNull(),
  batchFriendly: boolean("batch_friendly").notNull(),
  freezerFriendly: boolean("freezer_friendly").notNull(),
  steps: text("steps").array().notNull(),
  tags: text("tags").array().notNull(),
  /**
   * `library` rows mirror the code-defined library; `user` rows are the
   * user's own (Phase 13), kept out of library syncs entirely.
   */
  source: text("source").notNull().default("library"),
  /** A removed user meal: kept so history and FKs survive, never offered. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/** What the user thinks of each meal — learned through one-tap feedback. */
export const mealUserState = pgTable("meal_user_state", {
  mealId: text("meal_id")
    .primaryKey()
    .references(() => meals.id, { onDelete: "cascade" }),
  /** Null until asked; false means never suggest it again. */
  makeAgain: boolean("make_again"),
  partnerLiked: boolean("partner_liked"),
  lastCookedOn: date("last_cooked_on"),
  timesCooked: integer("times_cooked").notNull().default(0),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Manually confirmed food in the house (doc 04: manual truth over
 * assumed inventory). Soft-removed so history survives.
 */
export const pantryItems = pgTable("pantry_items", {
  id: serial("id").primaryKey(),
  ingredient: text("ingredient").notNull(),
  note: text("note"),
  useByDate: date("use_by_date"),
  /** In, but worth buying again — it goes on the shopping list (Phase 13). */
  runningLow: boolean("running_low").notNull().default(false),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

/** The day's food decision — a durable artifact, like the workout. */
export const fuelDays = pgTable(
  "fuel_days",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    dinnerMealId: text("dinner_meal_id").references(() => meals.id, {
      onDelete: "set null",
    }),
    dinnerReason: text("dinner_reason"),
    alternativeMealId: text("alternative_meal_id").references(() => meals.id, {
      onDelete: "set null",
    }),
    alternativeReason: text("alternative_reason"),
    lunchSorted: boolean("lunch_sorted").notNull().default(false),
    lunchNote: text("lunch_note"),
    mode: text("mode").notNull().default("rules"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("fuel_days_date_unique").on(table.date)],
);

/**
 * Fuel v2 (Phase 6 design, doc 04 §Shopping Lists). The week's dinners
 * are a pool rather than a Mon–Fri rota (decision G1) — cooked in
 * whatever order the week allows, with `cookedOn` running the pool down.
 * Keyed by `weekStart`; there's no parent row because there's nothing
 * true about a week that isn't already true of its meals.
 */
export const weekPlanMeals = pgTable("week_plan_meals", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull(),
  mealId: text("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  /** One line on why this meal is in the week. */
  reason: text("reason"),
  /** `dinner`, or `lunch` for a dedicated lunch prep (Phase 13). */
  slot: text("slot").notNull().default("dinner"),
  cookedOn: date("cooked_on"),
  addedAt: timestamp("added_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * `have` is the user saying "already got that" without buying it — doc
 * 04 is explicit that the system must not assume every missing
 * ingredient has to be purchased.
 */
export const shoppingItemStatus = pgEnum("shopping_item_status", [
  "needed",
  "bought",
  "have",
]);

export const shoppingItemSource = pgEnum("shopping_item_source", [
  "derived",
  "manual",
]);

/**
 * The week's list. Derived from the pool, but stored, because the user
 * edits it and those edits have to survive a re-derive.
 */
export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(),
    ingredient: text("ingredient").notNull(),
    status: shoppingItemStatus("status").notNull().default("needed"),
    source: shoppingItemSource("source").notNull().default("derived"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("shopping_items_week_ingredient_unique").on(
      table.weekStart,
      table.ingredient,
    ),
  ],
);

/**
 * Weekly reviews (doc 03: deeper adjustments happen weekly, not daily).
 * One durable artifact per week: the deterministic summary plus the
 * narrative, so it reads the same offline and after any AI outage.
 */
export const weeklyReviews = pgTable(
  "weekly_reviews",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    /** Calm prose summary shown at the top of the review. */
    narrative: text("narrative").notNull(),
    /** JSON WeekSummary — facts, wins, progression calls, watchouts. */
    summary: text("summary").notNull(),
    /** "ai" when the coach wrote the prose, "rules" when it didn't. */
    mode: text("mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("weekly_reviews_week_unique").on(table.weekStart)],
);

/**
 * Progress metrics (Phase 2 design §4, doc 13). One row per reading;
 * `kind` uses the domain vocabulary, validated at the repo boundary.
 * `note` carries the mobility score's per-test breakdown.
 */
export const metrics = pgTable(
  "metrics",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    kind: text("kind").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("metrics_kind_date_unique").on(table.kind, table.date)],
);

export const todayActions = pgTable("today_actions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  position: integer("position").notNull(),
  domain: lifeDomain("domain").notNull(),
  kind: actionKind("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  // Brief "why this matters today" (doc 10: Explain Why).
  rationale: text("rationale"),
  status: actionStatus("status").notNull().default("pending"),
  workoutId: integer("workout_id").references(() => workouts.id, {
    onDelete: "set null",
  }),
  projectActionId: integer("project_action_id").references(
    () => projectActions.id,
    { onDelete: "set null" },
  ),
  /**
   * The meal a food action is about, so ticking it off on Today records
   * the meal as cooked. Without this the tick was inert: the week's pool
   * never ran down and nothing was learned about what gets eaten.
   */
  mealId: text("meal_id").references(() => meals.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pauseReason = pgEnum("pause_reason", [...PAUSE_REASONS]);

/**
 * Time off training (Phase 8): unwell, or a deliberate break. An open
 * pause (no end date) stops sessions being planned; an ended unwell
 * pause eases the next sessions back in. Kept as history, never
 * deleted, so a return can be measured from it.
 */
export const trainingPauses = pgTable("training_pauses", {
  id: serial("id").primaryKey(),
  reason: pauseReason("reason").notNull(),
  startedOn: date("started_on").notNull(),
  endedOn: date("ended_on"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Devices that agreed to notifications (Phase 9, Web Push). One row
 * per browser subscription; removed when the push service says it has
 * expired.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per reminder actually sent, so two cron runs in the same
 * morning can never send it twice.
 */
export const sentReminders = pgTable(
  "sent_reminders",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    date: date("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("sent_reminders_kind_date_unique").on(table.kind, table.date)],
);

export const stressLevel = pgEnum("stress_level", [...STRESS_LEVELS]);
export const digestionState = pgEnum("digestion_state", [...DIGESTION_STATES]);

/**
 * The "how I feel" journal (Phase 12). Anytime, tap-only: each entry
 * holds only what was tapped, so every column is nullable. Pain stays
 * in pain_flags (one pain system, D10); sleep stays in the morning
 * check-in, which happens once a day.
 */
export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  /** The user's calendar date (Europe/London), not the server's. */
  date: date("date").notNull(),
  mood: integer("mood"),
  stress: stressLevel("stress"),
  energy: checkinEnergy("energy"),
  soreness: checkinSoreness("soreness"),
  digestion: digestionState("digestion"),
  /** The user's own trackers (Phase 15): tracker id → number or yes/no. */
  custom: jsonb("custom").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aisle = pgEnum("aisle", [...AISLES]);

/**
 * Ingredients the user has added beyond the built-in vocabulary
 * (Phase 13). The key is the same slug the built-ins use, so they
 * display, match and shop identically; the aisle places them on the
 * kitchen screen and in the shopping list's walking order.
 */
export const customIngredients = pgTable("custom_ingredients", {
  key: text("key").primaryKey(),
  aisle: aisle("aisle").notNull().default("other"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The user's setup (Phase 15). One row per deployment — each person
 * runs their own app. Stored as JSON and always read through
 * normaliseProfile, so the shape can grow without migrations and an
 * older row never breaks the app.
 */
export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The passcode chosen in the app (when APP_PASSCODE isn't set): one row,
 * holding only a salted PBKDF2 hash. Whoever sets it first claims the
 * copy; the login cookie is bound to the hash, so changing it signs
 * every other device out.
 */
export const appLock = pgTable("app_lock", {
  id: integer("id").primaryKey().default(1),
  passcodeHash: text("passcode_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
