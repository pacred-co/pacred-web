/**
 * Rate-mode guard — an ADVISORY that flags when the "คิดราคาแบบกำหนดเอง" custom
 * sell rate a pricer typed looks like it was entered for the WRONG transport mode
 * (e.g. a ทางรถ rate typed onto a ทางเรือ container).
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * The container's transport mode is authoritatively decoded from its cabinet name
 * (lib/forwarder/cabinet-transport.ts — GZS/SEA=เรือ · GZE/EK=รถ · GZA/AIR=อากาศ).
 * Each mode has its own per-CBM rate card. A pricer overriding the rate manually
 * can accidentally type the OTHER mode's number. This module compares the typed
 * rate against the DERIVED mode's expected rate and the other mode's rate; when
 * the typed value is materially below the derived-mode rate AND closer to the
 * other mode's rate, it warns.
 *
 * ── Behaviour — ADVISORY ONLY (mirrors lib/pricing/min-sell.ts) ──────────────
 * PURE + side-effect-free. Returns `level:"mismatch"` + a Thai message when the
 * typed rate looks wrong-mode; `level:"ok"` otherwise. It NEVER blocks, refuses,
 * or mutates a saved rate — accounting/ultra may quote any rate; the banner just
 * warns the pricer to double-check. Missing container/mode → `"ok"` (nothing to
 * evaluate). CBM basis is primary (the default billing basis); a KG-basis check
 * runs only when no CBM rates are present.
 */

export const MODE_LABEL_TH: Record<"1" | "2" | "3", string> = {
  "1": "ทางรถ",
  "2": "ทางเรือ",
  "3": "ทางอากาศ",
};

export type RateModeGuardLevel = "ok" | "mismatch";

export interface RateModeGuard {
  level: RateModeGuardLevel;
  /** The mode decoded from the container name (1=รถ · 2=เรือ · 3=อากาศ). */
  derivedMode: "1" | "2" | "3";
  /** The derived mode's expected ฿/CBM rate (0 = no card / not resolved). */
  expectedCbmRate: number;
  /** The typed custom ฿/CBM rate being evaluated. */
  typedCbmRate: number;
  /** Gentle Thai note when the typed rate looks wrong-mode; null when ok. */
  message: string | null;
}

export interface RateModeGuardInput {
  derivedMode: "1" | "2" | "3";
  /** The custom ฿/CBM the pricer typed. */
  typedCbmRate: number;
  /** The custom ฿/กก. the pricer typed. */
  typedKgRate: number;
  /** The derived-mode expected ฿/CBM (from the rate engine · 0 if unresolved). */
  expectedCbmRate: number;
  /** The OTHER mode's ฿/CBM (0 if none / air has no other mode). */
  otherModeCbmRate: number;
  /** The derived-mode expected ฿/กก. */
  expectedKgRate: number;
  /** The OTHER mode's ฿/กก. */
  otherModeKgRate: number;
}

const fmtThb = (x: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(x));

// Materiality threshold — the typed rate must differ from the derived-mode rate by
// more than 10% (EITHER direction) before we suspect a wrong-mode entry. A small
// manual discount within the mode is normal; direction-neutral because the other
// mode's rate can be higher OR lower (CBM: รถ<เรือ · KG: รถ>เรือ).
const MATERIAL_DIFF = 0.1;

function isWrongMode(typed: number, expected: number, other: number): boolean {
  // Nothing to compare against (no card / no other mode / no typed value).
  if (!(typed > 0 && expected > 0 && other > 0)) return false;
  // Materially different from the derived-mode rate (either direction) …
  if (Math.abs(typed - expected) <= expected * MATERIAL_DIFF) return false;
  // … AND closer to the OTHER mode's rate than to the derived-mode rate → likely
  // the pricer typed the wrong-mode number.
  return Math.abs(typed - other) < Math.abs(typed - expected);
}

/**
 * Evaluate a manually-typed custom rate against the container's derived transport
 * mode. Pure. Returns `mismatch` only when the typed value looks like the OTHER
 * mode's rate; `ok` in every other case (correct rate · below-but-not-other-mode ·
 * no rate card · no other mode). CBM basis primary; KG basis checked only when
 * no CBM rates are present.
 */
export function evaluateRateModeGuard(i: RateModeGuardInput): RateModeGuard {
  const base: Omit<RateModeGuard, "level" | "message"> = {
    derivedMode: i.derivedMode,
    expectedCbmRate: i.expectedCbmRate,
    typedCbmRate: i.typedCbmRate,
  };
  const derivedLabel = MODE_LABEL_TH[i.derivedMode];
  const otherMode = i.derivedMode === "1" ? "2" : i.derivedMode === "2" ? "1" : null;
  const otherLabel = otherMode ? MODE_LABEL_TH[otherMode] : "";

  // ── CBM basis (primary) ──
  if (i.expectedCbmRate > 0 || i.typedCbmRate > 0) {
    if (isWrongMode(i.typedCbmRate, i.expectedCbmRate, i.otherModeCbmRate)) {
      return {
        ...base,
        level: "mismatch",
        message:
          `⚠️ ตู้นี้เป็น${derivedLabel} (เรทระบบ ~฿${fmtThb(i.expectedCbmRate)}/CBM) ` +
          `แต่กรอก ฿${fmtThb(i.typedCbmRate)}/CBM — ใกล้เรท${otherLabel} · ` +
          `โปรดตรวจสอบว่ากรอกเรทผิดโหมดหรือไม่`,
      };
    }
    return { ...base, level: "ok", message: null };
  }

  // ── KG basis (only when no CBM rates present) ──
  if (isWrongMode(i.typedKgRate, i.expectedKgRate, i.otherModeKgRate)) {
    return {
      ...base,
      level: "mismatch",
      message:
        `⚠️ ตู้นี้เป็น${derivedLabel} (เรทระบบ ~฿${fmtThb(i.expectedKgRate)}/กก.) ` +
        `แต่กรอก ฿${fmtThb(i.typedKgRate)}/กก. — ใกล้เรท${otherLabel} · ` +
        `โปรดตรวจสอบว่ากรอกเรทผิดโหมดหรือไม่`,
    };
  }
  return { ...base, level: "ok", message: null };
}
