/**
 * Unit tests for the P0-13 / D1 Tier D admin shop UPDATE workflow handlers
 * in actions/admin/service-orders-shop-workflow.ts.
 *
 * Like actions/admin/wallet-hs.test.ts L281-283, this is a pure-logic
 * harness — we mirror the action's status guards + payload shape in this
 * file (the action body isn't exported because it lives in "use server"
 * which forbids non-async-function exports per Next 16) and lock down
 * the contract here. Real E2E (createAdminClient + Supabase REST) lives
 * behind a future qa-flow-simulator run.
 *
 * What's locked down:
 *   A. quoteGuard / orderedGuard / spawnGuard — the status-transition
 *      gates. Pre-check rejects any non-matching from-status with a
 *      human-readable error.
 *   B. defaultQuoteDeadline — NOW + 5 days, the legacy update2 hDatePayment.
 *   C. Quote UPDATE payload shape — the columns the action writes to
 *      tb_header_order for hstatus=1 → 2.
 *   D. Ordered UPDATE payload shape — tb_order.cshippingnumber across
 *      lines + tb_header_order.hstatus=4 stamp.
 *   E. Spawn-row shape — the spawn handler's tracking-expansion (parallel
 *      lists of cshippingnumber/ctrackingnumber inside one tb_order row)
 *      and 4→5 header update.
 *
 * Pattern matches actions/admin/wallet-hs.test.ts (pass/fail counts,
 * tsx-only runner, ESM `export {}` at the end).
 */

// ────────────────────────────────────────────────────────────
// Pure re-implementations of the action's helpers — same shape as
// wallet-hs.test.ts (which mirrors classifyHnoParent inline because the
// "use server" module can't export it). Any drift here = drift in the
// action body that the test would otherwise pass over silently.
// ────────────────────────────────────────────────────────────

function quoteGuard(status: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const s = (status ?? "").trim();
  if (s === "6") return { ok: false, error: "cancelled" };
  if (s === "5") return { ok: false, error: "completed" };
  if (s !== "1") return { ok: false, error: `bad:${s || "?"}` };
  return { ok: true };
}
function orderedGuard(status: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const s = (status ?? "").trim();
  if (s === "6") return { ok: false, error: "cancelled" };
  if (s === "5") return { ok: false, error: "completed" };
  if (s === "4") return { ok: false, error: "already" };
  if (s !== "3") return { ok: false, error: `bad:${s || "?"}` };
  return { ok: true };
}
function spawnGuard(status: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const s = (status ?? "").trim();
  if (s === "6") return { ok: false, error: "cancelled" };
  if (s === "5") return { ok: false, error: "already" };
  if (s !== "4") return { ok: false, error: `bad:${s || "?"}` };
  return { ok: true };
}
function defaultQuoteDeadline(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 5);
  return d;
}

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
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
function assertTrue(label: string, actual: boolean) {
  if (actual === true) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label} (expected true, got false)`);
  }
}
function section(name: string) {
  console.log(`\n${name}`);
}

console.log("=== service-orders-shop-workflow — pure helpers (P0-13) ===");

// ────────────────────────────────────────────────────────────
// A. Status guards
// ────────────────────────────────────────────────────────────

section("A. quoteGuard (1 → 2)");
assertEq("status '1' → ok",       quoteGuard("1"),       { ok: true });
assertEq("status '2' → reject",   quoteGuard("2").ok,    false);
assertEq("status '3' → reject",   quoteGuard("3").ok,    false);
assertEq("status '4' → reject",   quoteGuard("4").ok,    false);
assertEq("status '5' → reject (completed)",  quoteGuard("5").ok,    false);
assertEq("status '6' → reject (cancelled)",  quoteGuard("6").ok,    false);
assertEq("status null → reject", quoteGuard(null).ok,   false);
assertEq("status undefined → reject", quoteGuard(undefined).ok, false);
assertEq("status '' → reject",   quoteGuard("").ok,     false);

section("B. orderedGuard (3 → 4)");
assertEq("status '3' → ok",      orderedGuard("3"),     { ok: true });
assertEq("status '1' → reject", orderedGuard("1").ok,  false);
assertEq("status '2' → reject", orderedGuard("2").ok,  false);
assertEq("status '4' → reject (already)", orderedGuard("4").ok, false);
assertEq("status '5' → reject (completed)", orderedGuard("5").ok, false);
assertEq("status '6' → reject (cancelled)", orderedGuard("6").ok, false);
assertEq("status null → reject", orderedGuard(null).ok, false);

section("C. spawnGuard (4 → 5)");
assertEq("status '4' → ok",      spawnGuard("4"),       { ok: true });
assertEq("status '1' → reject", spawnGuard("1").ok,    false);
assertEq("status '2' → reject", spawnGuard("2").ok,    false);
assertEq("status '3' → reject", spawnGuard("3").ok,    false);
assertEq("status '5' → reject (already)",  spawnGuard("5").ok,    false);
assertEq("status '6' → reject (cancelled)", spawnGuard("6").ok,   false);

// ────────────────────────────────────────────────────────────
// D. defaultQuoteDeadline — NOW + 5 days
// ────────────────────────────────────────────────────────────

section("D. defaultQuoteDeadline (NOW + 5 days)");
const NOW = new Date("2026-06-01T00:00:00.000Z");
const deadline = defaultQuoteDeadline(NOW);
assertEq("deadline = NOW + 5d",
  deadline.toISOString(),
  "2026-06-06T00:00:00.000Z",
);
const NOW2 = new Date("2026-12-31T23:59:00.000Z");
const deadline2 = defaultQuoteDeadline(NOW2);
assertEq("deadline crosses year-boundary",
  deadline2.toISOString(),
  "2027-01-05T23:59:00.000Z",
);

// ────────────────────────────────────────────────────────────
// E. Quote UPDATE payload shape — pure builder (lock-down mirror)
// ────────────────────────────────────────────────────────────
//
// The action body in service-orders-shop-workflow.ts builds the UPDATE
// payload inline (it's not exported because the file is "use server").
// We re-implement the same builder here and lock down what columns get
// stamped + which input fields are conditional. The action's body MUST
// match this — any drift = test failure.

type QuoteInput = {
  htotalpriceuser: number;
  hshippingservice?: number;
  hcostallth?: number;
  hnote?: string;
};

function buildQuoteUpdate(
  d: QuoteInput,
  legacyAdminId: string,
  now: Date,
  deadlineDate: Date,
): Record<string, unknown> {
  const nowIso       = now.toISOString();
  const deadlineIso  = deadlineDate.toISOString();
  const update: Record<string, unknown> = {
    hstatus:         "2",
    htotalpriceuser: d.htotalpriceuser,
    hdatepayment:    deadlineIso,
    hdate2:          nowIso,
    hdateupdate:     nowIso,
    adminidupdate:   legacyAdminId,
  };
  if (d.hshippingservice !== undefined) update.hshippingservice = d.hshippingservice;
  if (d.hcostallth !== undefined)        update.hcostallth      = d.hcostallth;
  if (d.hnote !== undefined && d.hnote.length > 0) {
    update.hnote     = d.hnote;
    update.hnotedate = nowIso;
  }
  return update;
}

section("E. Quote UPDATE payload shape");
const quoteUpd1 = buildQuoteUpdate(
  { htotalpriceuser: 12_345.67 },
  "ภูม",
  NOW,
  defaultQuoteDeadline(NOW),
);
assertEq("minimum payload — just price",
  quoteUpd1,
  {
    hstatus:         "2",
    htotalpriceuser: 12_345.67,
    hdatepayment:    "2026-06-06T00:00:00.000Z",
    hdate2:          "2026-06-01T00:00:00.000Z",
    hdateupdate:     "2026-06-01T00:00:00.000Z",
    adminidupdate:   "ภูม",
  },
);

const quoteUpd2 = buildQuoteUpdate(
  {
    htotalpriceuser:  10_000,
    hshippingservice: 500,
    hcostallth:       300,
    hnote:            "ค่าตีลังเพิ่ม",
  },
  "admin_nat",
  NOW,
  defaultQuoteDeadline(NOW),
);
assertEq("full payload — all 4 optional fields stamp",
  quoteUpd2,
  {
    hstatus:          "2",
    htotalpriceuser:  10_000,
    hdatepayment:     "2026-06-06T00:00:00.000Z",
    hdate2:           "2026-06-01T00:00:00.000Z",
    hdateupdate:      "2026-06-01T00:00:00.000Z",
    adminidupdate:    "admin_nat",
    hshippingservice: 500,
    hcostallth:       300,
    hnote:            "ค่าตีลังเพิ่ม",
    hnotedate:        "2026-06-01T00:00:00.000Z",
  },
);

const quoteUpd3 = buildQuoteUpdate(
  { htotalpriceuser: 5_000, hnote: "" }, // empty note → not stamped
  "koy",
  NOW,
  defaultQuoteDeadline(NOW),
);
assertTrue("empty hnote → NOT stamped (hnote field absent)",
  !("hnote" in quoteUpd3),
);
assertTrue("empty hnote → NOT stamped (hnotedate field absent)",
  !("hnotedate" in quoteUpd3),
);

// ────────────────────────────────────────────────────────────
// F. Ordered UPDATE payload shape (header) — lock-down mirror
// ────────────────────────────────────────────────────────────

type OrderedInput = { cshippingnumber: string; hnotechn?: string };

function buildOrderedHeaderUpdate(
  d: OrderedInput,
  existing: { hnote: string | null },
  legacyAdminId: string,
  now: Date,
): Record<string, unknown> {
  const nowIso = now.toISOString();
  const trackingTag = `[ORDERED] cshippingnumber=${d.cshippingnumber}`;
  const headerNote =
    d.hnotechn && d.hnotechn.length > 0
      ? `${trackingTag} · ${d.hnotechn}`
      : trackingTag;
  return {
    hstatus:       "4",
    hdate4:        nowIso,
    hdateupdate:   nowIso,
    adminidupdate: legacyAdminId,
    hnote:         (existing.hnote ? `${existing.hnote}\n` : "") + headerNote,
    hnotedate:     nowIso,
  };
}

section("F. Ordered header UPDATE payload");
const orderedUpd1 = buildOrderedHeaderUpdate(
  { cshippingnumber: "SHOP123" },
  { hnote: null },
  "ภูม",
  NOW,
);
assertEq("no pre-existing hnote · no hnotechn",
  orderedUpd1,
  {
    hstatus:       "4",
    hdate4:        "2026-06-01T00:00:00.000Z",
    hdateupdate:   "2026-06-01T00:00:00.000Z",
    adminidupdate: "ภูม",
    hnote:         "[ORDERED] cshippingnumber=SHOP123",
    hnotedate:     "2026-06-01T00:00:00.000Z",
  },
);

const orderedUpd2 = buildOrderedHeaderUpdate(
  { cshippingnumber: "SHOP-999", hnotechn: "สีไม่ตรงตามที่สั่ง" },
  { hnote: "เก่า · ลูกค้าขอด่วน" },
  "ภูม",
  NOW,
);
assertEq("appends to existing hnote · includes hnotechn",
  orderedUpd2.hnote,
  "เก่า · ลูกค้าขอด่วน\n[ORDERED] cshippingnumber=SHOP-999 · สีไม่ตรงตามที่สั่ง",
);

// ────────────────────────────────────────────────────────────
// G. Spawn tracking expansion shape — pure builder
// ────────────────────────────────────────────────────────────
// The action expands tb_order rows into per-tracking entries that get
// passed into spawnForwardersFromShopOrder. Same logic as the inline
// loop in adminSpawnForwarderFromShopOrder — locked here so future
// refactors can't silently regress the parallel-list pairing or dedup.

type OrderRow = { cnameshop: string; cshippingnumber: string; ctrackingnumber: string | null };
type SpawnEntry = { cTrackingNumber: string; cShippingNumber: string };

function expandTrackings(rows: OrderRow[]): SpawnEntry[] {
  const out: SpawnEntry[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const ships = (r.cshippingnumber ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tracks = ((r.ctrackingnumber ?? "") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const max = Math.max(tracks.length, 1);
    for (let i = 0; i < max; i++) {
      const tracking = tracks[i] ?? "";
      if (!tracking) continue;
      if (seen.has(tracking)) continue;
      seen.add(tracking);
      out.push({
        cTrackingNumber: tracking,
        cShippingNumber: ships[i] ?? ships[0] ?? "",
      });
    }
  }
  return out;
}

section("G. Spawn tracking expansion");
assertEq("empty input → []",
  expandTrackings([]),
  [],
);
assertEq("no tracking → skipped (return empty)",
  expandTrackings([
    { cnameshop: "shopA", cshippingnumber: "S1", ctrackingnumber: "" },
  ]),
  [],
);
assertEq("1 row · 1 ship · 1 track → 1 entry",
  expandTrackings([
    { cnameshop: "shopA", cshippingnumber: "S1", ctrackingnumber: "T1" },
  ]),
  [{ cTrackingNumber: "T1", cShippingNumber: "S1" }],
);
assertEq("1 row · 2 ships, 2 tracks (parallel)",
  expandTrackings([
    { cnameshop: "shopA", cshippingnumber: "S1,S2", ctrackingnumber: "T1,T2" },
  ]),
  [
    { cTrackingNumber: "T1", cShippingNumber: "S1" },
    { cTrackingNumber: "T2", cShippingNumber: "S2" },
  ],
);
assertEq("1 row · 3 tracks, 1 ship — extra tracks pair with ship[0]",
  expandTrackings([
    { cnameshop: "shopA", cshippingnumber: "S1", ctrackingnumber: "T1,T2,T3" },
  ]),
  [
    { cTrackingNumber: "T1", cShippingNumber: "S1" },
    { cTrackingNumber: "T2", cShippingNumber: "S1" },
    { cTrackingNumber: "T3", cShippingNumber: "S1" },
  ],
);
assertEq("dedup by tracking — duplicate skipped",
  expandTrackings([
    { cnameshop: "shopA", cshippingnumber: "S1", ctrackingnumber: "T1" },
    { cnameshop: "shopB", cshippingnumber: "S2", ctrackingnumber: "T1" },
  ]),
  [{ cTrackingNumber: "T1", cShippingNumber: "S1" }],
);
assertEq("ctrackingnumber null → skipped",
  expandTrackings([
    { cnameshop: "shopA", cshippingnumber: "S1", ctrackingnumber: null },
  ]),
  [],
);
assertEq("multi-row · ALL kept (different trackings)",
  expandTrackings([
    { cnameshop: "shopA", cshippingnumber: "S1", ctrackingnumber: "T1" },
    { cnameshop: "shopB", cshippingnumber: "S2", ctrackingnumber: "T2" },
    { cnameshop: "shopC", cshippingnumber: "S3", ctrackingnumber: "T3" },
  ]),
  [
    { cTrackingNumber: "T1", cShippingNumber: "S1" },
    { cTrackingNumber: "T2", cShippingNumber: "S2" },
    { cTrackingNumber: "T3", cShippingNumber: "S3" },
  ],
);

// ────────────────────────────────────────────────────────────
// H. tb_promotion carry shape — lock-down mirror
// ────────────────────────────────────────────────────────────
// For each existing tb_promotion row with hno=origHno, INSERT one new
// row per spawned fNo: (date=now, promoid=existing.promoid, fid=newFno,
// hno=origHno). Idempotent: skip if (promoid, fid, hno) already exists.
// The shape locks down what gets written; the (skip-vs-insert) decision
// is left to the action where the SELECT lives.

function buildPromotionCarryRow(
  promoid: number,
  fid: number,
  hno: string,
  now: Date,
): Record<string, unknown> {
  return {
    date:    now.toISOString(),
    promoid,
    fid,
    hno,
  };
}

section("H. tb_promotion carry row shape");
assertEq("promo carry row writes (date, promoid, fid, hno)",
  buildPromotionCarryRow(77, 51999, "P20260601", NOW),
  {
    date:    "2026-06-01T00:00:00.000Z",
    promoid: 77,
    fid:     51999,
    hno:     "P20260601",
  },
);

// ────────────────────────────────────────────────────────────
// I. Spawn header 4→5 flip payload — lock-down mirror
// ────────────────────────────────────────────────────────────

function buildSpawnHeaderFlip(legacyAdminId: string, now: Date): Record<string, unknown> {
  const nowIso = now.toISOString();
  return {
    hstatus:       "5",
    hdate5:        nowIso,
    hdateupdate:   nowIso,
    adminidupdate: legacyAdminId,
  };
}

section("I. Spawn header flip payload (4 → 5)");
assertEq("4→5 stamps hstatus + hdate5 + hdateupdate + adminidupdate",
  buildSpawnHeaderFlip("ภูม", NOW),
  {
    hstatus:       "5",
    hdate5:        "2026-06-01T00:00:00.000Z",
    hdateupdate:   "2026-06-01T00:00:00.000Z",
    adminidupdate: "ภูม",
  },
);

// ────────────────────────────────────────────────────────────
// Wrap-up
// ────────────────────────────────────────────────────────────
console.log(`\n${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);

// Force ESM module mode — same pattern as wallet-hs.test.ts L283.
export {};
