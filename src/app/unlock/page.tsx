import { choosePasscode, unlock } from "./actions";
import { Button } from "@/components/ui/button";
import { passcodeState } from "@/lib/auth";
import { MIN_PASSCODE_LENGTH } from "@/lib/passcode";

export const dynamic = "force-dynamic";

export const metadata = { title: "Unlock" };

const inputClass =
  "h-11 w-full border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ retry?: string; problem?: string; taken?: string }>;
}) {
  const { retry, problem, taken } = await searchParams;
  const state = await passcodeState();

  // A new copy: the first thing its owner does is lock it.
  if (state === "unclaimed") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-6 py-10">
        <div>
          <p className="eyebrow">First, lock it</p>
          <h1 className="mt-2 text-[1.75rem] font-normal leading-tight">Choose your passcode</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This copy is yours. The passcode keeps your training, food and journal private:
            nobody can open the app without it. A short phrase you&apos;ll remember works best.
          </p>
        </div>
        <form action={choosePasscode} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            Passcode
            <input
              type="password"
              name="passcode"
              required
              minLength={MIN_PASSCODE_LENGTH}
              autoFocus
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Same again
            <input
              type="password"
              name="confirm"
              required
              minLength={MIN_PASSCODE_LENGTH}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          {problem && (
            <p role="status" className="text-sm text-muted-foreground">
              {problem}
            </p>
          )}
          <Button type="submit" className="h-11 w-full">
            Lock it and start
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          At least {MIN_PASSCODE_LENGTH} characters. You can change it later in Settings. Only a
          scrambled version is stored, in your own database.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6">
      <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Project 365</p>
      <form action={unlock} className="flex w-full flex-col gap-3">
        <input
          type="password"
          name="passcode"
          placeholder="Passcode"
          aria-label="Passcode"
          autoFocus
          autoComplete="current-password"
          className={`${inputClass} text-center`}
        />
        <Button type="submit" className="h-11 w-full">
          Unlock
        </Button>
      </form>
      {state === "unavailable" && (
        <p className="text-center text-sm text-muted-foreground">
          The passcode isn&apos;t set up on this deployment yet. Connect a database (Vercel →
          Storage → Neon) and redeploy, and the app will ask you to choose one.
        </p>
      )}
      {taken && (
        <p className="text-center text-sm text-muted-foreground">
          A passcode was already chosen for this copy. Unlock with it.
        </p>
      )}
      {retry && <p className="text-sm text-muted-foreground">That didn&apos;t match — try again.</p>}
    </main>
  );
}
