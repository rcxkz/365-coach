"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The app-wide fallback when a screen fails to render. Calm, says what's
 * safe, and offers the next step (doc 10) — never the framework's bare
 * "Application error" page.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-12">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="text-[1.75rem] font-normal leading-none">That didn&apos;t load.</h1>
      <p className="text-muted-foreground">
        Usually it&apos;s the signal. Anything you&apos;d already logged is saved, and sets
        tapped while offline go up on their own once you&apos;re back on.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className="border border-foreground bg-foreground px-4 py-3 text-sm font-medium text-background"
        >
          Try again
        </button>
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
          Back to Today
        </Link>
      </div>
    </main>
  );
}
