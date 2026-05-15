/**
 * U2-1 — bulletin generator unit tests.
 *
 * Mocks a SupabaseClient.from(...).select(...).neq(...).order(...).returns()
 * chain just enough to feed the buildDailyBulletin function. No DB hit.
 *
 * Asserts:
 *   - DD/MM/YY format (Bangkok timezone)
 *   - "ค้าง" / "ใหม่" section split via Bangkok-day boundary
 *   - Empty state ("(ไม่มีตู้ใน pipeline)")
 *   - Status label mapping
 *   - Line numbering continuous across sections
 */

import { buildDailyBulletin } from "./bulletin";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

// Minimal mock — supports the exact chain the implementation uses.
function mockClient(rows: unknown[] | null, error: { message: string } | null = null) {
  const result = { data: rows, error };
  const chain = {
    select: () => chain,
    neq:    () => chain,
    order:  () => chain,
    returns: () => result,
    // Final await → resolves to result. Supabase clients implement
    // PromiseLike via the builder pattern; this chain doubles as awaitable
    // because returns() returns the result directly and chain.then handles
    // the await case if needed.
    then: (onFulfilled: (r: typeof result) => unknown) => Promise.resolve(onFulfilled(result)),
  } as unknown;
  return {
    from: () => chain,
  } as unknown as Parameters<typeof buildDailyBulletin>[0];
}

console.log("buildDailyBulletin (U2-1)");

(async () => {
  const todayBkkIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) + "T08:00:00+07:00";
  const yesterdayBkkIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) + "T08:00:00+07:00";
  })();

  // ── (a) Empty pipeline ──
  console.log("  (a) empty pipeline");
  {
    const b = await buildDailyBulletin(mockClient([]));
    assert("date label is DD/MM/YY",            /^\d{2}\/\d{2}\/\d{2}$/.test(b.date_label));
    assert("total_count = 0",                   b.total_count === 0);
    assert("pending + new lines empty",         b.pending_lines.length === 0 && b.new_lines.length === 0);
    assert("text mentions empty pipeline",      b.text.includes("(ไม่มีตู้ใน pipeline)"));
    assert("text starts with date + สรุปรายการ", b.text.startsWith(b.date_label + " สรุปรายการ"));
  }

  // ── (b) Error from DB ──
  console.log("  (b) DB error");
  {
    const b = await buildDailyBulletin(mockClient(null, { message: "permission denied" }));
    assert("returns 0 count on error",          b.total_count === 0);
    assert("text surfaces error",               b.text.includes("โหลดข้อมูลไม่สำเร็จ"));
    assert("error message included",            b.text.includes("permission denied"));
  }

  // ── (c) All-pending (created yesterday) ──
  console.log("  (c) all-pending (no new today)");
  {
    const b = await buildDailyBulletin(mockClient([
      { code: "GZE260514-1", status: "in_transit", transport_mode: "truck", origin: "Guangzhou", destination: "BKK", eta: null, total_boxes: 50, total_shipments: 10, updated_at: yesterdayBkkIso, created_at: yesterdayBkkIso },
      { code: "YWE260513-1", status: "arrived",    transport_mode: "sea",   origin: "Yiwu",      destination: "LCH", eta: null, total_boxes: 80, total_shipments: 20, updated_at: yesterdayBkkIso, created_at: yesterdayBkkIso },
    ]));
    assert("total_count = 2",                       b.total_count === 2);
    assert("pending_lines = 2",                     b.pending_lines.length === 2);
    assert("new_lines = 0",                         b.new_lines.length === 0);
    assert("first pending line numbered 1",         b.pending_lines[0].startsWith("1."));
    assert("second pending line numbered 2",        b.pending_lines[1].startsWith("2."));
    assert("text contains #ค้าง",                    b.text.includes("#ค้าง"));
    assert("text does NOT contain ##ใหม่",           !b.text.includes("##ใหม่"));
    assert("status label mapped to Thai (in_transit→กลางทาง)", b.text.includes("กลางทาง"));
    assert("status label mapped to Thai (arrived→ถึงไทย)",     b.text.includes("ถึงไทย"));
    assert("transport emoji 🚚 included for truck", b.text.includes("🚚"));
    assert("transport emoji 🚢 included for sea",   b.text.includes("🚢"));
  }

  // ── (d) Mixed pending + new today ──
  console.log("  (d) mixed pending + new");
  {
    const b = await buildDailyBulletin(mockClient([
      { code: "TODAY-1",  status: "packing",    transport_mode: "air", origin: "Guangzhou", destination: "BKK", eta: null, total_boxes: 5,  total_shipments: 2, updated_at: todayBkkIso,     created_at: todayBkkIso },
      { code: "OLD-1",    status: "in_transit", transport_mode: "truck", origin: "Yiwu",     destination: "BKK", eta: null, total_boxes: 30, total_shipments: 8, updated_at: todayBkkIso,     created_at: yesterdayBkkIso },
      { code: "OLD-2",    status: "unloading",  transport_mode: "sea", origin: "Guangzhou",  destination: "BKK", eta: null, total_boxes: 60, total_shipments: 15, updated_at: yesterdayBkkIso, created_at: yesterdayBkkIso },
    ]));
    assert("total_count = 3",                  b.total_count === 3);
    assert("pending = 2 (OLD-1 + OLD-2)",      b.pending_lines.length === 2);
    assert("new = 1 (TODAY-1)",                b.new_lines.length === 1);
    assert("new line numbered 3 (continues)",  b.new_lines[0].startsWith("3."));
    assert("text has both sections",           b.text.includes("#ค้าง") && b.text.includes("##ใหม่"));
    // OLD-1 has updated_at=today → floats to top of pending
    const pendingFirst = b.pending_lines[0];
    assert("most-recently-updated pending floats up", pendingFirst.includes("OLD-1"));
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
})();
