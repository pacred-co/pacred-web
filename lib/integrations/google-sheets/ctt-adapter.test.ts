/**
 * Unit tests for lib/integrations/google-sheets/ctt-helpers.ts — the pure
 * logic behind the CTT warehouse → tb_forwarder sync. Pure, no IO.
 *
 * The supabase write path in ctt-adapter.ts can't be unit-tested without
 * a stack of mocks; the load-bearing safety rules (lock respect, empty-only
 * cabinet writes, forward-only date/status) live as pure helpers here so
 * they are exhaustively covered.
 *
 * Run:  pnpm tsx lib/integrations/google-sheets/ctt-adapter.test.ts
 *       (wired into pnpm test:unit)
 */

import {
  DEFAULT_CTT_COLUMNS,
  readCttColumnMap,
  parseCttRow,
  parseArrivalDate,
  ctTStatusLabelToFstatus,
  fstatusRank,
  shouldWriteCabinet,
  shouldWriteArrival,
  fstatusAdvanceTarget,
} from "./ctt-helpers";

let pass = 0;
let fail = 0;
function eq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(
      `  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}
function section(name: string) {
  console.log(`\n${name}`);
}

// ── Column map env reader ─────────────────────────────────────────
section("readCttColumnMap — env fallbacks");
eq(
  "no env → defaults",
  readCttColumnMap({}),
  DEFAULT_CTT_COLUMNS,
);
eq(
  "env override (all 4) wins",
  readCttColumnMap({
    CTT_COL_TRACKING: "5",
    CTT_COL_CABINET:  "6",
    CTT_COL_ARRIVAL:  "7",
    CTT_COL_STATUS:   "8",
  }),
  { tracking: 5, cabinet: 6, arrival: 7, status: 8 },
);
eq(
  "non-numeric env → fallback to default",
  readCttColumnMap({ CTT_COL_TRACKING: "banana" }),
  DEFAULT_CTT_COLUMNS,
);
eq(
  "negative env → fallback to default",
  readCttColumnMap({ CTT_COL_TRACKING: "-1" }),
  DEFAULT_CTT_COLUMNS,
);
eq(
  "partial override merges with defaults",
  readCttColumnMap({ CTT_COL_CABINET: "9" }),
  { ...DEFAULT_CTT_COLUMNS, cabinet: 9 },
);

// ── parseCttRow — sparse trailing cells handled ───────────────────
section("parseCttRow — sparse rows");
eq(
  "fully populated row",
  parseCttRow(["1", "TRACK123", "CTT260601-1", "2026-06-09", "ถึงไทย"], 2, DEFAULT_CTT_COLUMNS),
  {
    sheetRowNumber: 2,
    tracking:       "TRACK123",
    cabinet:        "CTT260601-1",
    arrivalRaw:     "2026-06-09",
    statusLabel:    "ถึงไทย",
  },
);
eq(
  "short row → missing fields become empty strings",
  parseCttRow(["1", "TRACK999"], 5, DEFAULT_CTT_COLUMNS),
  {
    sheetRowNumber: 5,
    tracking:       "TRACK999",
    cabinet:        "",
    arrivalRaw:     "",
    statusLabel:    "",
  },
);
eq(
  "trimmed cells (leading/trailing whitespace stripped)",
  parseCttRow(["1", "  TRACK_X  ", " CAB ", " 2026-01-02 ", " ถึงไทย "], 3, DEFAULT_CTT_COLUMNS),
  {
    sheetRowNumber: 3,
    tracking:       "TRACK_X",
    cabinet:        "CAB",
    arrivalRaw:     "2026-01-02",
    statusLabel:    "ถึงไทย",
  },
);

// ── parseArrivalDate — format tolerance ────────────────────────────
section("parseArrivalDate — accepts ISO + D/M/Y");
eq("ISO YYYY-MM-DD pass-through",   parseArrivalDate("2026-06-09"), "2026-06-09");
eq("ISO with single-digit M/D pads", parseArrivalDate("2026-1-2"),   "2026-01-02");
eq("D/M/Y Thai style → ISO",         parseArrivalDate("9/6/2026"),   "2026-06-09");
eq("D/M/Y zero-padded",              parseArrivalDate("09/06/2026"), "2026-06-09");
eq("invalid day (32) → null",        parseArrivalDate("32/6/2026"),  null);
eq("invalid month (13) → null",      parseArrivalDate("9/13/2026"),  null);
eq("garbage → null",                 parseArrivalDate("yesterday"),  null);
eq("empty → null",                   parseArrivalDate(""),           null);
eq("whitespace only → null",         parseArrivalDate("   "),        null);

// ── Status label map ──────────────────────────────────────────────
section("ctTStatusLabelToFstatus — substring match");
eq("'ถึงโกดังจีน' → fstatus 2",            ctTStatusLabelToFstatus("ถึงโกดังจีน"),       "2");
eq("'ถึงโกดังจีนแล้ว' → fstatus 2",        ctTStatusLabelToFstatus("ถึงโกดังจีนแล้ว"),   "2");
eq("'กำลังส่งมาไทย' → fstatus 3",          ctTStatusLabelToFstatus("กำลังส่งมาไทย"),     "3");
eq("'in transit' (en) → fstatus 3",         ctTStatusLabelToFstatus("In Transit"),         "3");
eq("'ถึงไทย' → fstatus 4",                 ctTStatusLabelToFstatus("ถึงไทย"),             "4");
eq("'ถึงโกดังไทย' → fstatus 4",            ctTStatusLabelToFstatus("ถึงโกดังไทย"),        "4");
eq("'รอชำระเงิน' → fstatus 5",             ctTStatusLabelToFstatus("รอชำระเงิน"),         "5");
eq("'กำลังจัดส่ง' → fstatus 6",            ctTStatusLabelToFstatus("กำลังจัดส่ง"),         "6");
eq("'ส่งแล้ว' → fstatus 7",                ctTStatusLabelToFstatus("ส่งแล้ว"),            "7");
eq("'Delivered' (en) → fstatus 7",         ctTStatusLabelToFstatus("Delivered"),          "7");
eq("unknown label → null (no guessing)",   ctTStatusLabelToFstatus("FooBar"),             null);
eq("empty label → null",                   ctTStatusLabelToFstatus(""),                   null);

// ── fstatusRank ────────────────────────────────────────────────────
section("fstatusRank");
eq("rank '1' = 1",  fstatusRank("1"),  1);
eq("rank '7' = 7",  fstatusRank("7"),  7);
eq("rank '99' = 99",fstatusRank("99"), 99);
eq("rank null = 0", fstatusRank(null), 0);
eq("rank '' = 0",   fstatusRank(""),   0);
eq("rank 'X' = 0",  fstatusRank("X"),  0);

// ── shouldWriteCabinet — EMPTY-ONLY + lock-respect ────────────────
section("shouldWriteCabinet");
eq(
  "empty current + incoming → write",
  shouldWriteCabinet({ incoming: "CTT260601-1", currentValue: null, cabinetLocked: false }),
  { write: true, locked: false },
);
eq(
  "empty string current + incoming → write",
  shouldWriteCabinet({ incoming: "CTT260601-1", currentValue: "", cabinetLocked: null }),
  { write: true, locked: false },
);
eq(
  "whitespace-only current + incoming → write",
  shouldWriteCabinet({ incoming: "CTT260601-1", currentValue: "  ", cabinetLocked: undefined }),
  { write: true, locked: false },
);
eq(
  "existing manual cabinet → NEVER overwrite",
  shouldWriteCabinet({ incoming: "CTT260601-1", currentValue: "MANUAL-CAB", cabinetLocked: false }),
  { write: false, locked: false },
);
eq(
  "locked=true → skip + flag locked",
  shouldWriteCabinet({ incoming: "CTT260601-1", currentValue: null, cabinetLocked: true }),
  { write: false, locked: true },
);
eq(
  "incoming empty → no write (no source data)",
  shouldWriteCabinet({ incoming: "", currentValue: null, cabinetLocked: false }),
  { write: false, locked: false },
);

// ── shouldWriteArrival — forward-only ─────────────────────────────
section("shouldWriteArrival");
eq("incoming + empty current → write",
  shouldWriteArrival({ incomingDate: "2026-06-09", currentValue: null }), true);
eq("incoming + '0000-00-00' sentinel → write",
  shouldWriteArrival({ incomingDate: "2026-06-09", currentValue: "0000-00-00" }), true);
eq("incoming + already-set → no write",
  shouldWriteArrival({ incomingDate: "2026-06-09", currentValue: "2026-05-01" }), false);
eq("no incoming → no write",
  shouldWriteArrival({ incomingDate: null, currentValue: null }), false);

// ── fstatusAdvanceTarget — forward-only ───────────────────────────
section("fstatusAdvanceTarget");
eq(
  "advance 2 → 3 returns '3'",
  fstatusAdvanceTarget({ incomingFstatus: "3", currentValue: "2" }),
  "3",
);
eq(
  "would-be roll-back 4 → 2 returns null",
  fstatusAdvanceTarget({ incomingFstatus: "2", currentValue: "4" }),
  null,
);
eq(
  "equal status (no change) returns null",
  fstatusAdvanceTarget({ incomingFstatus: "3", currentValue: "3" }),
  null,
);
eq(
  "no incoming → null",
  fstatusAdvanceTarget({ incomingFstatus: null, currentValue: "1" }),
  null,
);
eq(
  "empty current + incoming 1 → advance (1 > 0 rank)",
  fstatusAdvanceTarget({ incomingFstatus: "1", currentValue: null }),
  "1",
);

console.log(`\n${fail === 0 ? "✅" : "❌"} google-sheets/ctt-adapter: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
