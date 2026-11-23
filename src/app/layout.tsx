import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/bottom-nav";
import { getProfile } from "@/data/repos/profile";
import { isDemo, publicRepoUrl } from "@/lib/demo";
import { OfflineSync } from "@/components/offline-sync";
import { BRAND } from "@/theme/brand";
import { fontVariables } from "@/theme/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Project 365",
    template: "%s · Project 365",
  },
  description:
    "A calm personal operating system that tells you what matters next.",
  appleWebApp: {
    capable: true,
    title: "Project 365",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: BRAND.themeColor,
  // Draw behind the status bar when installed; the body pads itself
  // back out of the notch with the safe-area insets below.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pt-[env(safe-area-inset-top)]">
        <OfflineSync />
        {isDemo() && (
          <div className="border-b border-border px-4 py-2 text-center font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="text-highlight">●</span> Demo · a made-up week, reset nightly ·{" "}
            <a href={publicRepoUrl()} className="text-foreground underline underline-offset-2">
              Copy the setup.
            </a>
          </div>
        )}
        {children}
        <BottomNav modules={(await getProfile()).profile.modules} />
      </body>
    </html>
  );
}
