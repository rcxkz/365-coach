"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { logSetAction, unlogSetAction } from "@/app/workout/actions";
import { flushQueue, queueSize, subscribeToQueue } from "@/lib/offline-queue";

function subscribeToConnectivity(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/**
 * Registers the service worker and replays anything logged while
 * offline. Mounted once in the root layout.
 *
 * Connectivity and the pending queue are external state, so they're
 * read through useSyncExternalStore — the server snapshots (online,
 * nothing pending) keep hydration quiet.
 *
 * Renders a status line only when there's something to say; silence
 * means everything is saved (doc 10: calm, no noise).
 */
export function OfflineSync() {
  const router = useRouter();

  const pending = useSyncExternalStore(
    subscribeToQueue,
    queueSize,
    () => 0,
  );
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );

  const sync = useCallback(async () => {
    if (queueSize() === 0) return;
    const remaining = await flushQueue({
      log: logSetAction,
      unlog: unlogSetAction,
    });
    if (remaining === 0) router.refresh();
  }, [router]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // No offline cache is a degraded experience, not a broken one.
        });
    }
  }, []);

  // Replay on mount and whenever the connection comes back.
  useEffect(() => {
    if (online) void sync();
  }, [online, sync]);

  /**
   * `navigator.onLine` is not trustworthy on flaky mobile signal — a
   * one-bar connection where requests time out still reports online, so
   * no "online" event ever fires. While anything is pending, retry on a
   * timer and whenever the app comes back to the foreground.
   */
  useEffect(() => {
    if (pending === 0) return;
    const retry = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const timer = window.setInterval(retry, 20_000);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [pending, sync]);

  if (pending === 0 && online) return null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-3">
      <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
        {pending > 0 ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            {pending} {pending === 1 ? "set" : "sets"} waiting to save
            {online ? "." : " — they'll go up when you're back on signal."}
          </>
        ) : (
          <>
            <CloudOff className="h-3.5 w-3.5 shrink-0" />
            Offline — keep logging, everything saves when signal returns.
          </>
        )}
      </p>
    </div>
  );
}
