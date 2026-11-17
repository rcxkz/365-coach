"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, X } from "lucide-react";
import { logSetAction, unlogSetAction } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import type { SetLog } from "@/data/repos/workouts";
import { defaultRepsFor, measureFor } from "@/domain/targets";
import { enqueue } from "@/lib/offline-queue";

type LocalSet = { setNumber: number; reps: number; weightKg: number | null };

/**
 * Tap-first set logging: tapping a set chip logs it at the current
 * stepper values (pre-filled from the plan), so a session that went
 * exactly to plan is one tap per set. Tapping a logged chip un-logs it
 * again, so a mistap is never stuck.
 *
 * Taps apply locally first and are queued if the write fails — gym
 * signal drops mid-session and the log must survive it (offline-queue).
 */
export function SetLogger({
  exerciseId,
  targetSets,
  targetReps,
  targetWeightKg,
  sets,
  disabled,
}: {
  exerciseId: number;
  targetSets: number;
  targetReps: string;
  targetWeightKg: number | null;
  sets: SetLog[];
  disabled?: boolean;
}) {
  const measure = measureFor(targetReps);
  const [reps, setReps] = useState(() => defaultRepsFor(targetReps));
  const [weight, setWeight] = useState<number | null>(targetWeightKg);
  const [isPending, startTransition] = useTransition();
  // Local truth for this session; server rows seed it, taps update it
  // instantly so the UI never waits on the network.
  const [local, setLocal] = useState<LocalSet[]>(() =>
    sets.map((set) => ({
      setNumber: set.setNumber,
      reps: set.reps,
      weightKg: set.weightKg,
    })),
  );

  const logged = new Map(local.map((set) => [set.setNumber, set]));
  const allLogged = logged.size >= targetSets;

  function logSet(setNumber: number) {
    setLocal((current) => [
      ...current.filter((set) => set.setNumber !== setNumber),
      { setNumber, reps, weightKg: weight },
    ]);
    startTransition(async () => {
      try {
        await logSetAction(exerciseId, setNumber, reps, weight);
      } catch {
        enqueue({
          action: "log",
          exerciseId,
          setNumber,
          reps,
          weightKg: weight,
        });
      }
    });
  }

  function unlogSet(set: LocalSet) {
    // Re-seed the steppers so adjust-and-relog is natural.
    setReps(set.reps);
    setWeight(set.weightKg);
    setLocal((current) =>
      current.filter((item) => item.setNumber !== set.setNumber),
    );
    startTransition(async () => {
      try {
        await unlogSetAction(exerciseId, set.setNumber);
      } catch {
        enqueue({
          action: "unlog",
          exerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
        });
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: targetSets }, (_, index) => {
          const setNumber = index + 1;
          const set = logged.get(setNumber);
          return (
            <Button
              key={setNumber}
              variant={set ? "secondary" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => (set ? unlogSet(set) : logSet(setNumber))}
              aria-label={
                set
                  ? `Set ${setNumber} logged: ${measure.format(set.reps)} — tap to undo`
                  : `Log set ${setNumber}`
              }
            >
              {set
                ? `${measure.unit === "reps" ? set.reps : measure.format(set.reps)}${set.weightKg ? ` × ${set.weightKg}kg` : ""}`
                : `Set ${setNumber}`}
              {set && <X className="h-3 w-3 opacity-60" />}
            </Button>
          );
        })}
      </div>
      {!allLogged && !disabled && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Less (${measure.unit})`} onClick={() => setReps((r) => Math.max(1, r - measure.step))}>
              <Minus className="h-3 w-3" />
            </Button>
            {measure.format(reps)}
            <Button variant="ghost" size="icon-sm" aria-label={`More (${measure.unit})`} onClick={() => setReps((r) => r + measure.step)}>
              <Plus className="h-3 w-3" />
            </Button>
          </span>
          {weight !== null && (
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Less weight" onClick={() => setWeight((w) => Math.max(0, (w ?? 0) - 1))}>
                <Minus className="h-3 w-3" />
              </Button>
              {weight}kg
              <Button variant="ghost" size="icon-sm" aria-label="More weight" onClick={() => setWeight((w) => (w ?? 0) + 1)}>
                <Plus className="h-3 w-3" />
              </Button>
            </span>
          )}
          {isPending && <span className="sr-only">Saving</span>}
        </div>
      )}
    </div>
  );
}
