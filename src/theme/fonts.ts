import localFont from "next/font/local";

/**
 * THE TYPE — three faces, wired to CSS variables the stylesheet reads:
 * --font-heading (page titles), --font-sans (text), --font-mono (kickers
 * and every figure, so reps and kilos line up like a log book).
 *
 * The font files live in ./fonts, so the app builds anywhere, with no
 * call to Google Fonts (licences in ./fonts/LICENSE.md). To use your own,
 * drop the .woff2 files in ./fonts, point these at them, and keep the
 * `variable` names as they are.
 */
export const headingFont = localFont({
  src: [
    { path: "./fonts/dm-serif-display-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-serif-display-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-heading-face",
  display: "swap",
});

export const textFont = localFont({
  src: [
    { path: "./fonts/source-serif-4-latin-wght-normal.woff2", weight: "200 900", style: "normal" },
    { path: "./fonts/source-serif-4-latin-wght-italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-text-face",
  display: "swap",
});

export const monoFont = localFont({
  src: [
    { path: "./fonts/geist-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mono-face",
  display: "swap",
});

export const fontVariables = [headingFont, textFont, monoFont]
  .map((font) => font.variable)
  .join(" ");
