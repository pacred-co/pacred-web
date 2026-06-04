/**
 * Unit tests for lib/cart/ship-by-eligibility.ts — the legacy api-shipBy.php
 * carrier filter + checkPCSMaoMao.php gate. Pure, no IO.
 *
 * Run:  pnpm tsx lib/cart/ship-by-eligibility.test.ts   (wired into pnpm test:unit)
 */

import { getShipByOptionsForAddress, isMaomaoEligibleForAddress } from "./ship-by-eligibility";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const ids = (opts: { id: string }[]) => opts.map((o) => o.id);
const has = (opts: { id: string }[], id: string) => ids(opts).includes(id);

// ── PCSFAM — the "all options" account ──
section("PCSFAM all-options");
const fam = getShipByOptionsForAddress({ userID: "PCSFAM", zip: "10110", province: "กรุงเทพมหานคร", amphoe: "" });
assertTrue("PCSFAM gets the full carrier list (>40)", fam.length > 40);
assertTrue("PCSFAM list includes Flash (id 2)", has(fam, "2"));
assertTrue("PCSFAM list includes J&T (id 24)", has(fam, "24"));

// ── BKK metro free-ship ZIP → Flash only (maomao zone) ──
section("BKK metro ZIP → Flash only");
const bkk = getShipByOptionsForAddress({ userID: "PR1", zip: "10110", province: "กรุงเทพมหานคร", amphoe: "" });
assertEq("BKK ZIP returns exactly [Flash]", bkk, [{ id: "2", name: "Flash Express" }]);

// ── Province path (non-BKK ZIP) — Flash + province-matching carriers ──
section("province rules (non-BKK)");
const cr = getShipByOptionsForAddress({ userID: "PR1", zip: "57000", province: "เชียงราย", amphoe: "" });
assertTrue("เชียงราย includes Flash", has(cr, "2"));
assertTrue("เชียงราย includes MNB Transport (id 39)", has(cr, "39"));
assertTrue("เชียงราย includes เอ็มพอร์ท (id 45)", has(cr, "45"));
assertEq("เชียงราย does NOT include a northeast-only carrier (id 13)", has(cr, "13"), false);

// ── excludeAmphoe — ธนาไพศาล (22) drops out for สอยดาว ──
section("excludeAmphoe gate");
const chanSoidao = getShipByOptionsForAddress({ userID: "PR1", zip: "22000", province: "จันทบุรี", amphoe: "สอยดาว" });
const chanMueang = getShipByOptionsForAddress({ userID: "PR1", zip: "22000", province: "จันทบุรี", amphoe: "ท่าใหม่" });
assertEq("จันทบุรี/สอยดาว EXCLUDES ธนาไพศาล (id 22)", has(chanSoidao, "22"), false);
assertTrue("จันทบุรี/ท่าใหม่ INCLUDES ธนาไพศาล (id 22)", has(chanMueang, "22"));

// ── includeAmphoe — ตองสอง (20) only for the Korat allowlist ──
section("includeAmphoe gate");
const koratPakChong = getShipByOptionsForAddress({ userID: "PR1", zip: "30130", province: "นครราชสีมา", amphoe: "ปากช่อง" });
const koratOther = getShipByOptionsForAddress({ userID: "PR1", zip: "30130", province: "นครราชสีมา", amphoe: "ไม่มีอำเภอนี้" });
assertTrue("นครราชสีมา/ปากช่อง INCLUDES ตองสอง (id 20)", has(koratPakChong, "20"));
assertEq("นครราชสีมา/other EXCLUDES ตองสอง (id 20)", has(koratOther, "20"), false);

// ── maomao eligibility gate (checkPCSMaoMao.php) ──
section("isMaomaoEligibleForAddress");
assertEq("warehouse pickup (addressID='PCS') → not eligible", isMaomaoEligibleForAddress({ addressID: "PCS", zip: "10110" }), false);
assertEq("null addressID → not eligible", isMaomaoEligibleForAddress({ addressID: null, zip: "10110" }), false);
assertEq("real address + BKK ZIP → eligible", isMaomaoEligibleForAddress({ addressID: "5521", zip: "10110" }), true);
assertEq("real address + upcountry ZIP → not eligible", isMaomaoEligibleForAddress({ addressID: "5521", zip: "50000" }), false);

console.log(`\n${fail === 0 ? "✅" : "❌"} cart/ship-by-eligibility: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
