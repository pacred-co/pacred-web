/**
 * Pure helpers for the CTT warehouse → tb_forwarder sheet sync.
 *
 * Split out of `ctt-adapter.ts` so they can be unit-tested without mocking
 * Supabase. Mirrors the discipline of `lib/integrations/momo-isolated/
 * propagate.ts` (the proven safe writer):
 *
 *   - cabinet writes are EMPTY-ONLY (never overwrite a valid manual entry)
 *   - `fcabinet_locked=true` admin defensive belt is respected
 *   - `fdatetothai` is forward-only (only set when NULL or '0000-00-00')
 *   - `fstatus` is forward-only (never roll back; gated by status-rank)
 *
 * No IO here — keep this file dependency-free so tsc + tests stay fast.
 */

/** Default column index map (0-based) for the CTT sheet tab `CTT-New`. */
export type CttColumnMap = {
  /** Tracking number — the match key against `tb_forwarder.ftrackingchn`. */
  tracking:  number;
  /** Cabinet code (e.g. "CTT260601-1"). Optional cell. */
  cabinet:   number;
  /** Date stamp when the parcel reached the Thailand side (YYYY-MM-DD or D/M/Y). */
  arrival:   number;
  /** Status label — free text that we map to `fstatus` via STATUS_LABEL_MAP. */
  status:    number;
};

/**
 * Default column positions — best-guess based on the legacy `CTT-New!A1:R`
 * range (18 columns) + the columns the manual entry form
 * (`components/admin/carrier-manual-form.tsx`) accepts. ภูม / ก๊อต can
 * override any of these via env (`CTT_COL_TRACKING` / `CTT_COL_CABINET` /
 * `CTT_COL_ARRIVAL` / `CTT_COL_STATUS`) without a code redeploy.
 *
 * Column letters → 0-based index:
 *   A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9, K=10, L=11, M=12,
 *   N=13, O=14, P=15, Q=16, R=17
 */
export const DEFAULT_CTT_COLUMNS: CttColumnMap = {
  tracking:  1,  // B — typical "tracking no." position
  cabinet:   2,  // C — typical "cabinet / ตู้" position
  arrival:   3,  // D — typical "date arrived TH" position
  status:    4,  // E — typical free-text status position
};

/**
 * Read the column-index map from env with safe fallbacks. Invalid env values
 * (non-numeric, negative) fall back to the default — the cron should NEVER
 * crash from a typo in env config.
 *
 * Typed as a plain `Record<string, string | undefined>` instead of the
 * strict `NodeJS.ProcessEnv` (which insists on `NODE_ENV` being set) so
 * unit tests can pass a minimal `{}` literal.
 */
export type EnvLike = Record<string, string | undefined>;

export function readCttColumnMap(env: EnvLike = process.env): CttColumnMap {
  const pick = (key: string, fallback: number): number => {
    const raw = env[key];
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  };
  return {
    tracking:  pick("CTT_COL_TRACKING", DEFAULT_CTT_COLUMNS.tracking),
    cabinet:   pick("CTT_COL_CABINET",  DEFAULT_CTT_COLUMNS.cabinet),
    arrival:   pick("CTT_COL_ARRIVAL",  DEFAULT_CTT_COLUMNS.arrival),
    status:    pick("CTT_COL_STATUS",   DEFAULT_CTT_COLUMNS.status),
  };
}

/** A parsed CTT sheet row — extracted fields keyed for safe matching. */
export type CttSheetRow = {
  /** 1-based sheet row number (header + 0-indexed offset baked in). */
  sheetRowNumber: number;
  /** Trimmed tracking number — empty string when missing. */
  tracking:       string;
  /** Trimmed cabinet code — empty string when missing. */
  cabinet:        string;
  /** Raw arrival cell content (formats vary: "2026-06-09", "9/6/2026", etc.). */
  arrivalRaw:     string;
  /** Trimmed status label — empty string when missing. */
  statusLabel:    string;
};

/**
 * Extract the load-bearing fields from a raw sheet row, given the column
 * map. Missing/short rows degrade gracefully to empty strings — Sheets v4
 * does NOT pad sparse trailing cells, so any index access can be undefined.
 */
export function parseCttRow(
  row: string[],
  sheetRowNumber: number,
  cols: CttColumnMap,
): CttSheetRow {
  const cell = (idx: number): string => {
    const v = row[idx];
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    sheetRowNumber,
    tracking:    cell(cols.tracking),
    cabinet:     cell(cols.cabinet),
    arrivalRaw:  cell(cols.arrival),
    statusLabel: cell(cols.status),
  };
}

/**
 * Loose date parser for the CTT arrival cell. Accepts:
 *   - ISO: "2026-06-09" (the Sheets default if cell is formatted as date)
 *   - Slash D/M/Y: "9/6/2026" or "09/06/2026" (Thai office default)
 *   - Slash M/D/Y: also tolerated but ambiguous → we prefer D/M/Y
 *
 * Returns YYYY-MM-DD or null. NEVER throws.
 */
export function parseArrivalDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO already.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, "0");
    const d = iso[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Slash D/M/Y (Thai default) — also accept M/D/Y as fallback.
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const a = Number.parseInt(slash[1], 10);
    const b = Number.parseInt(slash[2], 10);
    const y = slash[3];
    // Prefer D/M/Y when the first value is > 12 (unambiguous).
    // Otherwise default to D/M/Y (Thai office convention) — staff who
    // type "9/6/2026" mean June 9th.
    const day   = a;
    const month = b;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Map free-text CTT status labels (set by warehouse staff in the sheet)
 * to `tb_forwarder.fstatus` codes. Designed to be additive — unknown labels
 * return null so the sync NEVER guesses a status advance. ก๊อต/ภูม extend
 * this map as new labels appear in the sheet.
 *
 * Codes mirror legacy `function.php` fstatus 1..7 (also referenced by the
 * MOMO propagate mapping in lib/integrations/momo-isolated/propagate.ts):
 *   1 = รอเข้าโกดังจีน · 2 = ถึงโกดังจีนแล้ว · 3 = กำลังส่งมาไทย ·
 *   4 = ถึงไทยแล้ว    · 5 = รอชำระเงิน      · 6 = เตรียมส่ง/กำลังจัดส่ง ·
 *   7 = ส่งแล้ว
 */
export function ctTStatusLabelToFstatus(label: string): string | null {
  const k = label.trim().toLowerCase();
  if (!k) return null;
  // Match by substring — labels vary ("ถึงโกดังจีน" vs "ถึงโกดังจีนแล้ว").
  if (k.includes("รอเข้าโกดังจีน") || k.includes("รอเข้าจีน"))      return "1";
  if (k.includes("ถึงโกดังจีน")    || k.includes("ถึงจีน"))         return "2";
  if (k.includes("กำลังส่งมาไทย") || k.includes("ส่งมาไทย") ||
      k.includes("ออกจากจีน")      || k.includes("transit"))         return "3";
  if (k.includes("ถึงไทย")         || k.includes("ถึงโกดังไทย"))     return "4";
  if (k.includes("รอชำระ")         || k.includes("waiting payment")) return "5";
  if (k.includes("เตรียมส่ง")     || k.includes("กำลังจัดส่ง") ||
      k.includes("กำลังส่ง"))                                          return "6";
  if (k.includes("ส่งแล้ว")        || k.includes("delivered") ||
      k.includes("จัดส่งเรียบร้อย"))                                   return "7";
  return null;
}

// ─────────────────────────────────────────────────────────────
// fstatus forward-only comparison (same rule as MOMO propagate).
// Higher rank = later in the flow. Unknown codes get rank 0 so they NEVER
// overwrite a known status.
// ─────────────────────────────────────────────────────────────
const FSTATUS_RANK: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "99": 99,
};
export function fstatusRank(v: string | null | undefined): number {
  if (!v) return 0;
  return FSTATUS_RANK[v] ?? 0;
}

/**
 * Decide whether to write `fcabinetnumber` for this forwarder row.
 *
 * Rules (all must hold to return `true`):
 *   1. Sheet supplies a non-empty cabinet value (`incoming` is the source).
 *   2. The existing tb_forwarder cabinet is EMPTY (null / "" / whitespace) —
 *      we NEVER overwrite a non-empty manual entry. (CTT sheet is partner
 *      data; admin's manual entry wins. Distinct from MOMO, which has a
 *      stale-routing-batch case — CTT has no equivalent so the rule is
 *      strictly EMPTY-ONLY.)
 *   3. `fcabinet_locked` is NOT true — admin's defensive belt (backlog
 *      #259 / migration 0150) blocks every partner write, this one
 *      included.
 *
 * Returns `{ write: false, locked: boolean }` so the caller can log + count
 * cabinetLocked separately for audit transparency.
 */
export function shouldWriteCabinet(args: {
  incoming:      string;
  currentValue:  string | null | undefined;
  cabinetLocked: boolean | null | undefined;
}): { write: boolean; locked: boolean } {
  const incoming = (args.incoming ?? "").trim();
  if (!incoming) return { write: false, locked: false };
  const current = (args.currentValue ?? "").trim();
  if (current !== "") return { write: false, locked: false };
  if (args.cabinetLocked === true) return { write: false, locked: true };
  return { write: true, locked: false };
}

/**
 * Decide whether to write `fdatetothai`. Forward-only:
 *   - Sheet supplies a parseable arrival date.
 *   - tb_forwarder has no date yet (null OR the legacy "0000-00-00"
 *     sentinel that survived the PCS port).
 */
export function shouldWriteArrival(args: {
  incomingDate:  string | null;
  currentValue:  string | null | undefined;
}): boolean {
  if (!args.incomingDate) return false;
  const cur = (args.currentValue ?? "").trim();
  if (cur === "" || cur === "0000-00-00") return true;
  return false;
}

/**
 * Decide whether to advance fstatus. Forward-only:
 *   - Sheet supplies a known fstatus mapping.
 *   - Target rank is strictly greater than current rank.
 *
 * Returns the value to write (string) or null to skip. Note: this helper
 * returns the value INDEPENDENTLY of any env gate — the caller decides
 * whether to honour or merely COUNT the would-be advance (so admins can
 * preview impact before flipping the env, same pattern as MOMO).
 */
export function fstatusAdvanceTarget(args: {
  incomingFstatus: string | null;
  currentValue:    string | null | undefined;
}): string | null {
  if (!args.incomingFstatus) return null;
  const targetRank  = fstatusRank(args.incomingFstatus);
  const currentRank = fstatusRank(args.currentValue);
  if (targetRank <= currentRank) return null;
  return args.incomingFstatus;
}
