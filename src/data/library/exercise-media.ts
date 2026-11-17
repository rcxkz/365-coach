/**
 * Start and end photos for library exercises, shown when an exercise is
 * tapped open on the workout screen (Phase 14) — a memory jog, not a
 * tutorial.
 *
 * Source: free-exercise-db (github.com/yuhonas/free-exercise-db), released
 * into the public domain under the Unlicense. Resized to 360px WebP and
 * served from public/exercises/<slug>-0.webp (start) and -1.webp (end).
 *
 * Only close matches are listed — a wrong picture is worse than none.
 * Everything else (recovery, breathing, niche drills) shows its cues and
 * a demo link instead.
 */
export const EXERCISE_PHOTOS: Record<string, string> = {
  a_skip: "fast-skipping",
  arch_hold: "superman",
  assault_bike_intervals: "air-bike",
  band_assisted_pull_up: "band-assisted-pull-up",
  band_face_pull: "face-pull",
  barbell_back_squat: "barbell-squat",
  barbell_bench_press: "barbell-bench-press-medium-grip",
  barbell_row: "bent-over-barbell-row",
  bench_dip: "bench-dips",
  box_jump: "front-box-jump",
  bulgarian_split_squat: "split-squat-with-dumbbells",
  cable_external_rotation: "external-rotation-with-cable",
  cat_cow: "cat-stretch",
  chin_up: "chin-up",
  conventional_deadlift: "barbell-deadlift",
  couch_stretch: "kneeling-hip-flexor",
  dead_bug: "dead-bug",
  diamond_push_up: "pushups-close-and-wide-hand-positions",
  dip: "dips-triceps-version",
  dumbbell_row: "one-arm-dumbbell-row",
  dumbbell_shoulder_press: "dumbbell-shoulder-press",
  explosive_pull_up: "pullups",
  farmers_carry: "farmers-walk",
  glute_bridge: "butt-lift-bridge",
  goblet_squat: "goblet-squat",
  hamstring_strap_stretch: "hamstring-stretch",
  hanging_knee_raise: "hanging-leg-raise",
  hip_thrust: "barbell-hip-thrust",
  incline_dumbbell_press: "incline-dumbbell-press",
  incline_push_up: "incline-push-up",
  jump_rope: "rope-jumping",
  lat_pulldown: "wide-grip-lat-pulldown",
  lateral_bound: "lateral-bound",
  leg_curl: "seated-leg-curl",
  leg_press: "leg-press",
  machine_chest_press: "leverage-chest-press",
  med_ball_slam: "overhead-slam",
  negative_dip: "dips-triceps-version",
  negative_pull_up: "pullups",
  nordic_curl_negative: "natural-glute-ham-raise",
  overhead_press: "standing-military-press",
  pallof_press: "pallof-press",
  pull_up: "pullups",
  puppy_pose: "childs-pose",
  push_up: "pushups",
  reverse_lunge: "dumbbell-rear-lunge",
  ring_row: "inverted-row",
  romanian_deadlift: "romanian-deadlift",
  rower_intervals: "rowing-stationary",
  rower_steady: "rowing-stationary",
  scapular_pull_up: "scapular-pull-up",
  seated_cable_row: "seated-cable-rows",
  side_plank: "side-bridge",
  single_leg_hop_and_stick: "single-leg-hop-progression",
  sled_drag: "sled-drag-harness",
  sled_push: "sled-push",
  sprint_intervals: "wind-sprints",
  stair_climber: "stairmaster",
  step_up: "dumbbell-step-ups",
  suitcase_carry: "farmers-walk",
  trap_bar_deadlift: "trap-bar-deadlift",
  walking_lunge: "bodyweight-walking-lunge",
  wall_calf_stretch: "calf-stretch-hands-against-wall",
  wall_handstand_hold: "handstand-push-ups",
  weighted_dip: "dips-triceps-version",
  weighted_pull_up: "weighted-pull-ups",
  worlds_greatest_stretch: "worlds-greatest-stretch",
  zone2_cycle: "bicycling-stationary",
  zone2_incline_walk: "walking-treadmill",
};

export function exercisePhotos(libraryExerciseId: string | null): [string, string] | null {
  const slug = libraryExerciseId ? EXERCISE_PHOTOS[libraryExerciseId] : undefined;
  return slug ? [`/exercises/${slug}-0.webp`, `/exercises/${slug}-1.webp`] : null;
}

/** A video search for the movement — works for every exercise, photos or not. */
export function demoSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`;
}
