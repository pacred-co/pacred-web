import { relativeTimeTh, freshnessClass } from "./relative-time";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

console.log("relative-time helper");
{
  const now = Date.now();

  // ── relativeTimeTh ──
  console.log("  relativeTimeTh");
  assert("null input → '—'",                  relativeTimeTh(null) === "—");
  assert("undefined input → '—'",             relativeTimeTh(undefined) === "—");
  assert("now → 'เพิ่งอัพเดท'",                relativeTimeTh(now) === "เพิ่งอัพเดท");
  assert("5s ago → 'เพิ่งอัพเดท'",             relativeTimeTh(now - 5_000) === "เพิ่งอัพเดท");
  assert("45s ago → '45 วินาทีที่แล้ว'",        relativeTimeTh(now - 45_000) === "45 วินาทีที่แล้ว");
  assert("5min ago → '5 นาทีที่แล้ว'",         relativeTimeTh(now - 5 * 60_000) === "5 นาทีที่แล้ว");
  assert("3h ago → '3 ชั่วโมงที่แล้ว'",        relativeTimeTh(now - 3 * 60 * 60_000) === "3 ชั่วโมงที่แล้ว");
  assert("2d ago → '2 วันที่แล้ว'",             relativeTimeTh(now - 2 * 24 * 60 * 60_000) === "2 วันที่แล้ว");
  assert("3 weeks ago → '3 สัปดาห์ที่แล้ว'",    relativeTimeTh(now - 21 * 24 * 60 * 60_000) === "3 สัปดาห์ที่แล้ว");
  // Past 30 days — falls back to absolute date format
  const ancientResult = relativeTimeTh(now - 60 * 24 * 60 * 60_000);
  assert("60d ago → absolute date (no 'ที่แล้ว')", !ancientResult.includes("ที่แล้ว"));

  // String input accepted
  assert("ISO string accepted",                relativeTimeTh(new Date(now - 3 * 60_000).toISOString()) === "3 นาทีที่แล้ว");

  // ── BUG-5: tz-less DB strings are UTC, must NOT read 7h old on Bangkok client ──
  console.log("  tz-less DB strings (BUG-5)");
  // A just-created order serialized tz-less ("YYYY-MM-DD HH:MM:SS", UTC) must
  // read เพิ่งอัพเดท / a few seconds — never "7 ชั่วโมงที่แล้ว".
  const bareNowSpace = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  const bareNowT = new Date().toISOString().replace(/\.\d+Z$/, "");
  const rSpace = relativeTimeTh(bareNowSpace);
  const rT = relativeTimeTh(bareNowT);
  assert("tz-less space 'now' → recent (not ชั่วโมง)", !rSpace.includes("ชั่วโมง"));
  assert("tz-less 'T' 'now' → recent (not ชั่วโมง)",   !rT.includes("ชั่วโมง"));
  assert("tz-less space 'now' → เพิ่ง/วินาที",         rSpace === "เพิ่งอัพเดท" || rSpace.includes("วินาที"));
  // A tz-less string 3 min old → exactly "3 นาทีที่แล้ว" (parsed as UTC).
  const bare3min = new Date(now - 3 * 60_000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  assert("tz-less space 3min → '3 นาทีที่แล้ว'",       relativeTimeTh(bare3min) === "3 นาทีที่แล้ว");

  // ── freshnessClass ──
  console.log("  freshnessClass");
  assert("null → 'unknown'",                   freshnessClass(null) === "unknown");
  assert("now → 'fresh'",                      freshnessClass(now) === "fresh");
  assert("30min ago → 'fresh'",                freshnessClass(now - 30 * 60_000) === "fresh");
  assert("3h ago → 'recent'",                  freshnessClass(now - 3 * 60 * 60_000) === "recent");
  assert("2d ago → 'stale'",                   freshnessClass(now - 2 * 24 * 60 * 60_000) === "stale");
  assert("10d ago → 'very-old'",               freshnessClass(now - 10 * 24 * 60 * 60_000) === "very-old");
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
