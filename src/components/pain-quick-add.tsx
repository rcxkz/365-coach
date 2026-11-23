"use client";

import { useState, useTransition } from "react";
import { addPainFlagAction } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";

/** The usual suspects, after whatever the user protects in their setup. */
const COMMON = ["shoulder", "lower_back", "knee", "wrist", "ankle", "elbow"];

/**
 * Two-tap pain capture (doc 03: record location + severity without
 * friction): tap a location, tap a severity, done.
 */
export function PainQuickAdd({ protect = [] }: { protect?: string[] }) {
  const locations = [...new Set([...protect, ...COMMON])];
  const [location, setLocation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  if (!location) {
    return (
      <div className="flex flex-wrap gap-2">
        {locations.map((name) => (
          <Button key={name} variant="outline" size="sm" onClick={() => setLocation(name)}>
            {name.replace(/_/g, " ")}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm capitalize">{location.replace(/_/g, " ")} — how strong?</span>
      {failed && (
        <span role="status" className="basis-full text-sm text-muted-foreground">
          That didn&apos;t save. Try again when you&apos;ve got signal.
        </span>
      )}
      {[1, 2, 3, 4, 5].map((severity) => (
        <Button
          key={severity}
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await addPainFlagAction(location, severity);
                setLocation(null);
                setFailed(false);
              } catch {
                setFailed(true);
              }
            })
          }
        >
          {severity}
        </Button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setLocation(null)}>
        Cancel
      </Button>
    </div>
  );
}
