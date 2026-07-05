/**
 * <DocSectionLabel> — the SHARED section-band label used by every money-doc
 * "paper" template's footer (สรุป · ชำระเงิน · หมายเหตุ · รับรอง).
 *
 * Owner directive 2026-07-05 (root-fix): the paper templates each hand-rolled
 * their own section labels → they drifted (one had an emoji, another didn't,
 * fonts/weights differed). PEAK-style docs prefix each section with an emoji
 * and align them consistently. This one tiny component is the single home for
 * that label so a single edit fixes the label on EVERY document.
 *
 * Server Component (no client/state). Pure presentational.
 */

import type { CSSProperties } from "react";

/** The canonical footer-section labels + their PEAK emoji. Import + reuse so
 *  no paper re-types the emoji/text pair (that drift is exactly what we fix). */
export const DOC_SECTION = {
  summary: { emoji: "📋", text: "สรุป" },
  payment: { emoji: "💵", text: "ชำระเงิน" },
  remark:  { emoji: "💬", text: "หมายเหตุ" },
  certify: { emoji: "✍️", text: "รับรอง" },
} as const;

export type DocSectionKey = keyof typeof DOC_SECTION;

/**
 * Render one section label. Pass either a `section` key (recommended — uses the
 * canonical emoji+text pair) or an explicit `emoji`+`text`.
 * `style` merges onto the default so a paper can nudge min-width without
 * re-hardcoding the font (the whole point of the shared label).
 */
export function DocSectionLabel({
  section,
  emoji,
  text,
  style,
}: {
  section?: DocSectionKey;
  emoji?: string;
  text?: string;
  style?: CSSProperties;
}) {
  const e = emoji ?? (section ? DOC_SECTION[section].emoji : "");
  const t = text ?? (section ? DOC_SECTION[section].text : "");
  return (
    <p
      style={{
        margin: 0,
        fontSize: "11px",
        fontWeight: "bold",
        color: "#111827",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span style={{ marginRight: "3px" }}>{e}</span>
      {t}
    </p>
  );
}
