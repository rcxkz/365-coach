import { isDemo } from "@/lib/demo";

/**
 * THE MAKER'S STAMP — the small line at the foot of Settings.
 *
 * It shows on the original app and its public demo. On your own copy it
 * stays hidden unless you set MAKER_STAMP=1, and you can make it yours
 * by changing the text below.
 */
export const BRAND = {
  stamp: "A Rykz build · No. 03",
  /** The browser and home-screen bar colour: match --background in theme.css. */
  themeColor: "#181818",
} as const;

export function showMakerStamp(): boolean {
  return isDemo() || process.env.MAKER_STAMP === "1";
}
