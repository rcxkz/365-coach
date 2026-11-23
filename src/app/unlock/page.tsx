import { unlock } from "./actions";
import { Button } from "@/components/ui/button";
import { authConfig } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Unlock" };

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ retry?: string }>;
}) {
  const { retry } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6">
      <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
        Project 365
      </p>
      <form action={unlock} className="flex w-full flex-col gap-3">
        <input
          type="password"
          name="passcode"
          placeholder="Passcode"
          autoFocus
          autoComplete="current-password"
          className="h-11 rounded-lg border border-input bg-background px-4 text-center text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" className="h-11 w-full">
          Unlock
        </Button>
      </form>
      {!authConfig() && (
        <p className="text-center text-sm text-muted-foreground">
          The passcode isn&apos;t set up on this deployment yet. In Vercel, open
          Settings → Environment Variables, add APP_PASSCODE (a passphrase you&apos;ll
          remember), then redeploy.
        </p>
      )}
      {retry && (
        <p className="text-sm text-muted-foreground">
          That didn&apos;t match — try again.
        </p>
      )}
    </main>
  );
}
