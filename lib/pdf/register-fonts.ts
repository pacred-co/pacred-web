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

  // 2026-06-05 (ภูม flag · PDF Chinese garbled) — Noto Sans SC for CJK glyphs.
  // Sarabun doesn't include any CJK glyphs → Chinese product titles + shop
  // names render as garbage Latin-1 bytes (e.g. "z À ÇaÉÇaQÛ"). Register
  // separately + apply via `<Text style={{ fontFamily: "NotoSansSC" }}>` on
  // fields known to contain Chinese (ctitle, cnameshop). Noto Sans SC subset
  // OTF from googlefonts/noto-cjk (~8MB · covers all CJK Simplified glyphs
  // commonly seen in Taobao/1688 listings + Latin/digits).
  Font.register({
    family: "NotoSansSC",
    fonts: [
      { src: path.join(fontsDir, "NotoSansSC-Regular.otf"), fontWeight: "normal" },
    ],
  });

  // Disable hyphenation — Thai doesn't use word boundaries the same way
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
