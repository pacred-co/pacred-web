/**
 * Wave 29 #205 — mint-receipt-doc-no unit tests.
 *
 * Asserts the doc-number minter matches legacy `functions.php:457-486`:
 *   - prefix FRC (corporate=1) vs FRG (corporate=2)
 *   - yyMM token correct for any month/year
 *   - First-of-month → 00001 fallback
 *   - Bump logic (substring -5 + 1 → zero-pad)
 *   - Handles malformed legacy rids defensively
 *
 * Run:  pnpm tsx lib/admin/mint-receipt-doc-no.test.ts
 *   (also wired into pnpm test:unit via package.json)
 */

import {
  mintReceiptDocNo,
  yyMmTokenForDate,
  deriveCorporateFromUser,
} from "./mint-receipt-doc-no";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    fail++;
  }
}

// ─────────────────────────────────────────────────────────────
// yyMmTokenForDate — the date helper
// ─────────────────────────────────────────────────────────────

console.log("=== yyMmTokenForDate ===");

check("May 2026 → '2605'",        yyMmTokenForDate(new Date(2026, 4, 15))  === "2605");
check("January 2026 → '2601'",    yyMmTokenForDate(new Date(2026, 0, 1))   === "2601");
check("December 2099 → '9912'",   yyMmTokenForDate(new Date(2099, 11, 31)) === "9912");
check("September pads month",     yyMmTokenForDate(new Date(2026, 8, 1))   === "2609");

// ─────────────────────────────────────────────────────────────
// deriveCorporateFromUser — the customer-tier helper
// ─────────────────────────────────────────────────────────────

console.log("=== deriveCorporateFromUser ===");

check("has corporateNumber → 1 (FRC)",       deriveCorporateFromUser({ corporatenumber: "0105560160694" }) === 1);
check("empty corporateNumber → 2 (FRG)",     deriveCorporateFromUser({ corporatenumber: "" })              === 2);
check("whitespace corporateNumber → 2",      deriveCorporateFromUser({ corporatenumber: "   " })           === 2);
check("null corporateNumber → 2",            deriveCorporateFromUser({ corporatenumber: null })            === 2);
check("undefined user → 2",                  deriveCorporateFromUser(null)                                 === 2);
check("user without the field → 2",          deriveCorporateFromUser({})                                   === 2);

// ─────────────────────────────────────────────────────────────
// mintReceiptDocNo — the canonical minter
//
// We stub a minimal SupabaseClient — just the chain we use:
//   admin.from(table).select(cols).eq(col, val).ilike(col, pat).order(...)
//        .limit(n).maybeSingle()
//
// The stub returns whatever scenario we set up.
// ─────────────────────────────────────────────────────────────

function makeStubAdmin(scenario: {
  rid?: string | null;
  error?: { code: string; message: string };
}): unknown {
  type Builder = {
    select: (cols: string) => Builder;
    eq: (col: string, val: unknown) => Builder;
    ilike: (col: string, pat: string) => Builder;
    order: (col: string, o: unknown) => Builder;
    limit: (n: number) => Builder;
    maybeSingle: <T>() => Promise<{ data: T | null; error: { code: string; message: string } | null }>;
  };
  const builder: Builder = {
    select: () => builder,
    eq:     () => builder,
    ilike:  () => builder,
    order:  () => builder,
    limit:  () => builder,
    maybeSingle: async () => ({
      data:  scenario.rid !== undefined ? ({ rid: scenario.rid } as never) : null,
      error: scenario.error ?? null,
    }),
  };
  return { from: () => builder };
}

console.log("=== mintReceiptDocNo — corporate=2 (FRG · บุคคล) ===");

async function run(): Promise<void> {
  const may2026 = new Date(2026, 4, 29);

  // FRG · empty month → 00001
  const r1 = await mintReceiptDocNo(
    makeStubAdmin({ rid: null }) as never,
    { corporate: 2, dateSlip: may2026 },
  );
  check("FRG · empty month → 'FRG2605-00001'", r1 === "FRG2605-00001", `got '${r1}'`);

  // FRG · last was 00219 → bumps to 00220
  const r2 = await mintReceiptDocNo(
    makeStubAdmin({ rid: "FRG2605-00219" }) as never,
    { corporate: 2, dateSlip: may2026 },
  );
  check("FRG · last 00219 → 'FRG2605-00220'", r2 === "FRG2605-00220", `got '${r2}'`);

  // FRG · last was 00001 → bumps to 00002
  const r3 = await mintReceiptDocNo(
    makeStubAdmin({ rid: "FRG2605-00001" }) as never,
    { corporate: 2, dateSlip: may2026 },
  );
  check("FRG · last 00001 → 'FRG2605-00002'", r3 === "FRG2605-00002", `got '${r3}'`);

  // FRG · last was 99999 → bumps to 100000 (5-pad still works; 6-char overflow handled)
  const r4 = await mintReceiptDocNo(
    makeStubAdmin({ rid: "FRG2605-99999" }) as never,
    { corporate: 2, dateSlip: may2026 },
  );
  check("FRG · 99999 overflow → 'FRG2605-100000'", r4 === "FRG2605-100000", `got '${r4}'`);

  console.log("=== mintReceiptDocNo — corporate=1 (FRC · นิติบุคคล) ===");

  const r5 = await mintReceiptDocNo(
    makeStubAdmin({ rid: null }) as never,
    { corporate: 1, dateSlip: may2026 },
  );
  check("FRC · empty month → 'FRC2605-00001'", r5 === "FRC2605-00001", `got '${r5}'`);

  const r6 = await mintReceiptDocNo(
    makeStubAdmin({ rid: "FRC2605-00080" }) as never,
    { corporate: 1, dateSlip: may2026 },
  );
  check("FRC · last 00080 → 'FRC2605-00081'", r6 === "FRC2605-00081", `got '${r6}'`);

  console.log("=== mintReceiptDocNo — defensive behaviour ===");

  // Malformed last rid — short suffix without padding. `slice(-5)` of
  // "FRG2605-9" returns "605-9"; parseInt scans until "-" → 605; +1 → 606
  // → padded → "FRG2605-00606". Better than collapsing to 00001 (would
  // collide with the very first row of the month). Just assert the result
  // is a valid-shape rid; specific bumped value depends on the malformed
  // input's structure and we don't need to pin it.
  const r7 = await mintReceiptDocNo(
    makeStubAdmin({ rid: "FRG2605-9" }) as never,
    { corporate: 2, dateSlip: may2026 },
  );
  check(
    "FRG · malformed 'FRG2605-9' → valid bumped rid",
    /^FRG2605-\d{5,}$/.test(r7) && r7 !== "FRG2605-00001",
    `got '${r7}'`,
  );

  // Completely garbage rid → falls back to 00001
  const r8 = await mintReceiptDocNo(
    makeStubAdmin({ rid: "GARBAGE" }) as never,
    { corporate: 2, dateSlip: may2026 },
  );
  check("FRG · 'GARBAGE' → falls back to 00001 (NaN parse)", r8 === "FRG2605-00001", `got '${r8}'`);

  // Supabase error → falls back to 00001
  const r9 = await mintReceiptDocNo(
    makeStubAdmin({ error: { code: "PGRST500", message: "timeout" } }) as never,
    { corporate: 2, dateSlip: may2026 },
  );
  check("FRG · db error → falls back to 00001", r9 === "FRG2605-00001", `got '${r9}'`);

  console.log("=== mintReceiptDocNo — month rollover ===");

  // June 2026 · empty month → 2606-00001
  const r10 = await mintReceiptDocNo(
    makeStubAdmin({ rid: null }) as never,
    { corporate: 2, dateSlip: new Date(2026, 5, 1) },
  );
  check("FRG · June 2026 empty → 'FRG2606-00001'", r10 === "FRG2606-00001", `got '${r10}'`);

  // December 2026 last 00500 → 00501
  const r11 = await mintReceiptDocNo(
    makeStubAdmin({ rid: "FRG2612-00500" }) as never,
    { corporate: 2, dateSlip: new Date(2026, 11, 31) },
  );
  check("FRG · Dec 2026 last 00500 → 'FRG2612-00501'", r11 === "FRG2612-00501", `got '${r11}'`);
}

run().then(() => {
  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) {
    process.exit(1);
  }
}).catch((err) => {
  console.error("test run threw", err);
  process.exit(1);
});
