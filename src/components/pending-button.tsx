"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * A submit button that says it's working while its form's action runs.
 * Anything that asks the coach takes 20-40 seconds, and a button that
 * looks untouched for that long reads as broken.
 */
export function PendingButton({
  pendingLabel,
  children,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
