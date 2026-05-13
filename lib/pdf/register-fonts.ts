/**
 * Register Sarabun (Thai-supporting) font for @react-pdf/renderer.
 *
 * Sarabun is the SIL Open Font License Thai font by Cadson Demak.
 * TTF files bundled at `public/fonts/` and read at runtime from the
 * filesystem (`process.cwd()`) — works in dev + Vercel deployment.
 *
 * Call `registerPdfFonts()` once before rendering any `<Document>` —
 * the function is idempotent so it's safe to call multiple times.
 *
 * Server-only: do NOT import in client components.
 */

import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;

  const fontsDir = path.join(process.cwd(), "public", "fonts");

  Font.register({
    family: "Sarabun",
    fonts: [
      { src: path.join(fontsDir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(fontsDir, "Sarabun-Bold.ttf"),    fontWeight: "bold"   },
    ],
  });

  // Disable hyphenation — Thai doesn't use word boundaries the same way
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
