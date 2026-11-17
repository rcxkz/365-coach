import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { getProfile } from "@/data/repos/profile";
import { isDemo, publicRepoUrl } from "@/lib/demo";
import { OfflineSync } from "@/components/offline-sync";
import "./globals.css";

/**
 * Archivo carries the text: warmer than a grotesque at small sizes,
 * and its heavier weights hold up as wide, tracked-out labels — the
 * locker-room / ledger-column voice the screens are built around.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Every figure in this app — reps, kilos, minutes, pounds — is set in
 * Plex Mono. Numbers are the content here, so they get their own face
 * and align in columns like a log book.
 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pt-[env(safe-area-inset-top)]">
        <OfflineSync />
        {isDemo() && (
          <div className="bg-foreground px-4 py-2 text-center text-xs text-background">
            A demo: a made-up person&apos;s week, reset every night.{" "}
            <a href={publicRepoUrl()} className="underline underline-offset-2">
              Run your own →
            </a>
          </div>
        )}
        {children}
        <BottomNav modules={(await getProfile()).profile.modules} />
      </body>
    </html>
  );
}
