/**
 * W11 — Thai customs-house / port-code master (the รหัสท่า on every ใบขน).
 *
 * Source: deep-source mine of `Project dev/ท่า Port.txt` + `รหัสท่าเรือ.pdf`,
 * captured in `docs/research/freight-knowledge-2026-06-01/04-customs-docs-accounting.md`
 * §1.3 + `docs/learnings/customs-brokerage-kit.md`.
 *
 * The customs-house code is a load-bearing field on every customs declaration
 * (ใบขนสินค้า) — it identifies the customs station that processes the entry and,
 * for AIR ports, sets the per-DO cost + a VAT-rounding quirk (BFS adds 2฿ before
 * the ×7%). This module is a STATIC reference map (no DB) — capture/display only.
 *
 * Pure data — importable from both server and client (no directive).
 */

export type CustomsPortMode = "sea" | "air" | "truck";

export type CustomsPortCodeEntry = {
  /** The 4-digit customs-house code printed on the declaration. */
  code: string;
  /** Thai display name of the customs house / terminal. */
  nameTh: string;
  /** English / romanised name. */
  nameEn: string;
  mode: CustomsPortMode;
  /** Parent customs office grouping (e.g. "1190" = สุวรรณภูมิ). */
  parent?: string;
  /** Optional per-DO cost (THB) seen in the legacy sheets (AIR ports). */
  doCostThb?: number;
  /**
   * VAT-rounding quirk: some terminals add a flat surcharge to the DO base
   * BEFORE applying ×7% VAT (e.g. BFS +2฿). Captured for the doc team; the
   * platform does NOT auto-compute — advisory only.
   */
  vatRoundingNote?: string;
  /** Free-form note (carrier hints, terminal aliases). */
  note?: string;
};

/**
 * The customs-house code master. NOT exhaustive — the most-used SEA / AIR /
 * TRUCK stations from the legacy decode. Free-text `port_of_entry` on the
 * declaration still accepts anything; this is the curated picker + lookup.
 */
export const CUSTOMS_PORT_CODES: readonly CustomsPortCodeEntry[] = [
  // ── SEA ────────────────────────────────────────────────────────────
  { code: "0119", nameTh: "ท่าเรือกรุงเทพ (PAT · T1-T2)", nameEn: "Bangkok Port (PAT)", mode: "sea", note: "ท่าเรือกรุงเทพ คลองเตย" },
  { code: "0121", nameTh: "ท่าเรือกรุงเทพ — Terminal 1", nameEn: "Bangkok Port Terminal 1", mode: "sea", parent: "0119" },
  { code: "0122", nameTh: "ท่าเรือกรุงเทพ — Terminal 2", nameEn: "Bangkok Port Terminal 2", mode: "sea", parent: "0119" },
  { code: "2801", nameTh: "ท่าเรือแหลมฉบัง", nameEn: "Laem Chabang Port", mode: "sea" },
  { code: "2809", nameTh: "Kerry Siam Seaport (แหลมฉบัง)", nameEn: "Kerry Siam Seaport", mode: "sea", parent: "2801" },
  { code: "2814", nameTh: "สทบ. แหลมฉบัง", nameEn: "Laem Chabang (STB)", mode: "sea", parent: "2801" },
  { code: "2839", nameTh: "Kerry 2 (แหลมฉบัง)", nameEn: "Kerry 2 Laem Chabang", mode: "sea", parent: "2801" },
  { code: "2840", nameTh: "แหลมฉบัง D1", nameEn: "Laem Chabang D1", mode: "sea", parent: "2801" },

  // ── AIR (สุวรรณภูมิ parent 1190) ─────────────────────────────────────
  { code: "1190", nameTh: "ด่านศุลกากรท่าอากาศยานสุวรรณภูมิ", nameEn: "Suvarnabhumi Airport Customs", mode: "air" },
  { code: "1191", nameTh: "Thai Airways Cargo (สุวรรณภูมิ)", nameEn: "Thai Airways Cargo", mode: "air", parent: "1190" },
  { code: "1194", nameTh: "Thai Airways Cargo — UPS Express", nameEn: "Thai Airways Cargo (UPS Express)", mode: "air", parent: "1190", doCostThb: 498, note: "UPS Express" },
  { code: "1192", nameTh: "WFS-PG Cargo (สุวรรณภูมิ)", nameEn: "WFS-PG Cargo", mode: "air", parent: "1190" },
  { code: "1193", nameTh: "BFS Cargo (FedEx / DHL)", nameEn: "BFS Cargo (FedEx/DHL)", mode: "air", parent: "1190", doCostThb: 428, vatRoundingNote: "+2฿ บนฐาน DO ก่อนคูณ VAT 7%", note: "FedEx / DHL" },

  // ── TRUCK (cross-border land) ───────────────────────────────────────
  { code: "3601", nameTh: "ด่านศุลกากรมุกดาหาร (ศภ.2)", nameEn: "Mukdahan Customs (Region 2)", mode: "truck" },
  { code: "3612", nameTh: "มุกดาหาร — ลานทอง", nameEn: "Mukdahan — Lanthong", mode: "truck", parent: "3601" },
  { code: "3615", nameTh: "มุกดาหาร — K.D.Express RPT", nameEn: "Mukdahan — K.D.Express RPT", mode: "truck", parent: "3601" },
] as const;

const CODE_INDEX: ReadonlyMap<string, CustomsPortCodeEntry> = new Map(
  CUSTOMS_PORT_CODES.map((p) => [p.code, p]),
);

/** Look up a customs-house entry by its code. Returns null if not in the master. */
export function findPortCode(code: string | null | undefined): CustomsPortCodeEntry | null {
  if (!code) return null;
  return CODE_INDEX.get(code.trim()) ?? null;
}

/** Filter the master to one transport mode (for a mode-specific picker). */
export function portCodesForMode(mode: CustomsPortMode): CustomsPortCodeEntry[] {
  return CUSTOMS_PORT_CODES.filter((p) => p.mode === mode);
}

/** Display label: "0119 — ท่าเรือกรุงเทพ (PAT · T1-T2)". */
export function portCodeLabel(entry: CustomsPortCodeEntry): string {
  return `${entry.code} — ${entry.nameTh}`;
}

export const CUSTOMS_PORT_MODE_LABEL: Record<CustomsPortMode, string> = {
  sea:   "ทางเรือ (SEA)",
  air:   "ทางอากาศ (AIR)",
  truck: "ทางบก/ข้ามแดน (TRUCK)",
};
