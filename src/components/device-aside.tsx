import { headers } from "next/headers";
import { MakerStamp } from "@/components/maker-stamp";
import { QrCode } from "@/components/qr-code";
import { isDemo, publicRepoUrl } from "@/lib/demo";

/**
 * Wide screens only (see .device-stage in globals.css): the app is built
 * for a phone, so on a desktop it runs inside a phone-sized frame and
 * this panel says so, with a QR code to open it on the phone instead.
 */
export async function DeviceAside() {
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000";
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/`;

  return (
    <aside className="device-aside" aria-label="About this app">
      <p className="eyebrow">Built for your phone</p>
      <h2 className="mt-4 font-heading text-[2.5rem] font-normal leading-[1.04]">
        Made for the gym floor.
        <em className="block pl-[0.55em]">Open it on your phone.</em>
      </h2>
      <p className="mt-6 max-w-[34ch] text-base leading-relaxed text-muted-foreground">
        It plans the day, logs sets offline and works with one thumb. On a phone it
        installs like an app: Share, then Add to Home Screen.
      </p>
      <div className="mt-8 flex items-center gap-6">
        <div className="size-32 shrink-0 border border-foreground bg-foreground p-2 text-background">
          <QrCode value={url} label={`QR code to open ${url} on your phone`} />
        </div>
        <p className="font-mono text-[0.6875rem] font-medium uppercase leading-relaxed tracking-[0.18em] text-muted-foreground">
          Scan to open it
          <br />
          on your phone.
        </p>
      </div>
      {isDemo() && (
        <a
          href={publicRepoUrl()}
          className="mt-8 inline-block border border-foreground px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] hover:bg-foreground hover:text-background"
        >
          Copy the setup.
        </a>
      )}
      <div className="mt-10">
        <MakerStamp />
      </div>
    </aside>
  );
}
