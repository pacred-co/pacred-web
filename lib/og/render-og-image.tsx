import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared 1200×630 social card (Facebook / LINE / Twitter `summary_large_image`
 * spec) for Pacred. One branded template, parameterized per page so every
 * service landing gets its OWN keyword-rich OG image instead of the generic
 * site default.
 *
 * Used by:
 *   - `app/opengraph-image.tsx` (site default — generic card)
 *   - per-service `opengraph-image.tsx` route files (service-specific cards)
 *
 * Server-only (reads the Sarabun TTFs from `public/fonts` via `node:fs`).
 * Never import from a `"use client"` component.
 */

/** Card dimensions — the OG/Twitter large-image standard. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;

const BRAND_RED = "#B30000";
const ACCENT = "#FFE0E0";

export type OgImageOptions = {
  /** First headline line (rendered white). Keep short — fits ~1 line. */
  line1: string;
  /** Second headline line (rendered accent-pink). */
  line2: string;
  /** Bottom-left mode chips, joined by faded dots. */
  chips?: string[];
};

export async function renderOgImage({
  line1,
  line2,
  chips = ["FCL · LCL", "รถ · เรือ · อากาศ"],
}: OgImageOptions) {
  const [regular, bold] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Sarabun-Regular.ttf")),
    readFile(join(process.cwd(), "public/fonts/Sarabun-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(135deg, #B30000 0%, #7A0000 60%, #420000 100%)",
          color: "white",
          fontFamily: "Sarabun",
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: BRAND_RED,
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: -2,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
            Pacred
          </div>
        </div>

        {/* Headlines */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -2,
              maxWidth: 1010,
            }}
          >
            {line1}
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -2,
              color: ACCENT,
              maxWidth: 1010,
            }}
          >
            {line2}
          </div>
        </div>

        {/* Footer row — mode chips + domain */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 26,
            opacity: 0.95,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {chips.map((chip, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 18 }}
              >
                {i > 0 ? <span style={{ opacity: 0.5 }}>·</span> : null}
                <span>{chip}</span>
              </div>
            ))}
          </div>
          <div style={{ fontWeight: 700 }}>pacred.co</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Sarabun", data: regular, style: "normal", weight: 400 },
        { name: "Sarabun", data: bold, style: "normal", weight: 700 },
      ],
    },
  );
}
