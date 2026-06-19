/**
 * แต้ม (ไอแต้ม) warehouse-reconcile feed parser.
 *
 * แต้ม maintains the AUTHORITATIVE per-tracking ground truth (container · transport ·
 * product type · box count · total weight · total volume) in a Google Sheet ("MOMO
 * Pacred"). The owner (2026-06-19) said: *"ข้อมูลรายละเอียดงานที่ถูกต้องที่ชัวร์ เราจะเอา
 * จากฝั่งแต้ม · เอาไปอัพเดทข้อมูลให้ตรงกับที่แต้มอัพเดทมา"*.
 *
 * This parses a paste of that sheet (copy rows from Google Sheets → tab-separated)
 * into structured rows the reconcile action matches to tb_forwarder by ftrackingchn.
 *
 * Robust to: an optional header row (maps columns by NAME when present, else falls
 * back to the canonical column order), comma thousands separators, and "note" rows
 * where แต้ม has no data yet (กระสอบรวม / ยังไม่ปิดตู้ / ซ้ำ / ไม่พบ) — those carry the
 * note text and are flagged isData=false so the reconcile skips them.
 */

export type TaemRow = {
  tracking: string;
  /** Container Name cell — a real container code (GZS…/GZE…/EK…) OR a note. */
  container: string | null;
  trans: string | null;       // SEA / ROAD / AIR
  type: string | null;        // 普通货物/ทั่วไป/A · 电器/มอก./M · 药和食物/อย./O …
  code: string | null;        // customer code (PR…/PCS…)
  parcel: number | null;      // Total Parcel
  totalWt: number | null;     // Total Wt. (kg)
  totalVol: number | null;    // Total Vol. (m³)
  /** true = แต้ม has full data (real container + wt + vol) → reconcilable. */
  isData: boolean;
  /** when !isData, the Container-Name note explaining why (กระสอบรวม/ยังไม่ปิดตู้/…). */
  note: string | null;
};

export type TaemParseResult = {
  rows: TaemRow[];
  headerSeen: boolean;
};

// Canonical column order of แต้ม's "MOMO Pacred" sheet (1-based in the sheet →
// 0-based here). Used as the fallback when no header row is detected.
const CANON: Record<keyof Omit<TaemRow, "isData" | "note">, number> = {
  tracking: 0,    // A ftrackingchn
  container: 1,   // B Container Name
  trans: 2,       // C Trans
  type: 8,        // I Type
  code: 9,        // J Code
  parcel: 14,     // O Total Parcel
  totalWt: 17,    // R Total Wt.
  totalVol: 18,   // S Total Vol.
};

// Header-cell text → our field key.
const HEADER_MAP: Record<string, keyof typeof CANON> = {
  "ftrackingchn": "tracking",
  "container name": "container",
  "trans": "trans",
  "type": "type",
  "code": "code",
  "total parcel": "parcel",
  "total wt.": "totalWt",
  "total wt": "totalWt",
  "total vol.": "totalVol",
  "total vol": "totalVol",
};

function toNum(v: string | undefined | null): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellStr(v: string | undefined | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function parseTaemReconcile(text: string): TaemParseResult {
  const lines = text.split(/\r?\n/).map((l) => l).filter((l) => l.trim() !== "");
  const rows: TaemRow[] = [];
  let headerSeen = false;
  // default index map = canonical
  let idx: Record<keyof typeof CANON, number> = { ...CANON };

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const first = (cells[0] ?? "").trim().toLowerCase();

    // header row → rebuild the index map from the header names
    if (first === "ftrackingchn") {
      headerSeen = true;
      const m: Partial<Record<keyof typeof CANON, number>> = {};
      cells.forEach((c, ci) => {
        const key = HEADER_MAP[(c ?? "").trim().toLowerCase()];
        if (key && m[key] === undefined) m[key] = ci;
      });
      // only adopt mapped keys; keep canonical for any unmapped
      idx = { ...CANON, ...m } as Record<keyof typeof CANON, number>;
      continue;
    }

    const tracking = cellStr(cells[idx.tracking]);
    if (!tracking) continue; // a row with no tracking is not actionable

    const container = cellStr(cells[idx.container]);
    const totalWt = toNum(cells[idx.totalWt]);
    const totalVol = toNum(cells[idx.totalVol]);
    // A "data" row = แต้ม has real measurements (weight + volume). The container
    // may be a real code (GZS…/GZE…/EK…) OR empty on a split continuation row
    // (1779955936-2..-5 inherit the parent's container) — both are reconcilable.
    // A row with NO measurements is a note (กระสอบรวม / ยังไม่ปิดตู้ / ซ้ำ / ไม่พบ).
    const isData = totalWt != null && totalVol != null;

    rows.push({
      tracking,
      container,
      trans: cellStr(cells[idx.trans]),
      type: cellStr(cells[idx.type]),
      code: cellStr(cells[idx.code]),
      parcel: toNum(cells[idx.parcel]),
      totalWt,
      totalVol,
      isData,
      note: isData ? null : container,
    });
  }

  return { rows, headerSeen };
}
