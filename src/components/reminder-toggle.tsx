"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import {
  subscribeToReminders,
  unsubscribeFromReminders,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

type State =
  | "loading"
  | "unsupported"
  | "install_first"
  | "blocked"
  | "off"
  | "on"
  | "working"
  | "error";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * The morning reminder switch. On iPhone, web push only exists inside
 * the installed app (iOS 16.4+), so outside it this explains how to
 * install rather than showing a button that can't work.
 */
export function ReminderToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    void (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        setState(/iPhone|iPad/.test(navigator.userAgent) && !isStandalone() ? "install_first" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })();
  }, []);

  async function turnOn() {
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      await subscribeToReminders(subscription.toJSON());
      setState("on");
    } catch {
      setState("error");
    }
  }

  async function turnOff() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromReminders(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  }

  switch (state) {
    case "loading":
      return <p className="text-sm text-muted-foreground">Checking…</p>;
    case "install_first":
      return (
        <p className="text-sm text-muted-foreground">
          On iPhone, reminders work from the installed app. In Safari tap
          Share → Add to Home Screen, open Project 365 from there, and
          come back to this page.
        </p>
      );
    case "unsupported":
      return (
        <p className="text-sm text-muted-foreground">
          This browser can&apos;t receive reminders. The installed app on
          your phone can.
        </p>
      );
    case "blocked":
      return (
        <p className="text-sm text-muted-foreground">
          Notifications are turned off for Project 365. Turn them back on
          in your phone&apos;s Settings → Notifications, then come back
          here.
        </p>
      );
    case "on":
      return (
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm">
            <BellRing className="h-4 w-4" /> On for this phone
          </p>
          <Button size="sm" variant="outline" onClick={turnOff}>
            Turn off
          </Button>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            That didn&apos;t go through — worth another try.
          </p>
          <Button size="sm" onClick={turnOn}>
            Try again
          </Button>
        </div>
      );
    default:
      return (
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BellOff className="h-4 w-4" /> Off
          </p>
          <Button size="sm" onClick={turnOn} disabled={state === "working"}>
            {state === "working" ? "Turning on…" : "Turn on"}
          </Button>
        </div>
      );
  }
}
