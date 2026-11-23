import { DM_Serif_Display, Geist_Mono, Source_Serif_4 } from "next/font/google";

/**
 * THE TYPE — three faces, wired to CSS variables the stylesheet reads:
 * --font-heading (page titles), --font-sans (text), --font-mono (kickers
 * and every figure, so reps and kilos line up like a log book).
 *
 * To use your own, swap these for any Google font (next/font/google)
 * and keep the `variable` names as they are.
 */
export const headingFont = DM_Serif_Display({
  variable: "--font-heading-face",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const textFont = Source_Serif_4({
  variable: "--font-text-face",
  subsets: ["latin"],
  display: "swap",
});

export const monoFont = Geist_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

export const fontVariables = [headingFont, textFont, monoFont]
  .map((font) => font.variable)
  .join(" ");
