"use client";

import { useEffect, useRef, useState } from "react";
import { ChoiceChips } from "@/components/choice-chips";
import { MODULE_OPTIONS as OPTIONS } from "./options";


/**
 * Which parts of the app are on. At least one has to be: with none, the
 * form won't submit and says why (a hidden required field carries the
 * message, so the browser points at this question).
 */
export function ModulePicker({ checked }: { checked: string[] }) {
  const [count, setCount] = useState(checked.length);
  const guard = useRef<HTMLInputElement>(null);

  useEffect(() => {
    guard.current?.setCustomValidity(
      count > 0 ? "" : "Pick at least one: Training, Food or How I feel.",
    );
  }, [count]);

  return (
    <div
      onChange={(event) =>
        setCount(event.currentTarget.querySelectorAll('input[name="modules"]:checked').length)
      }
    >
      <ChoiceChips name="modules" multiple checked={checked} options={OPTIONS} />
      <input
        ref={guard}
        aria-hidden
        tabIndex={-1}
        required
        readOnly
        value={count > 0 ? "ok" : ""}
        className="sr-only"
      />
      <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
        {count === 0
          ? "Nothing chosen yet. Pick at least one."
          : `${count} of 3 chosen.`}
      </p>
    </div>
  );
}
