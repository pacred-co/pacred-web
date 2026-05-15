/**
 * Unit tests for isFreeShippingZip.
 *
 * Ports legacy verification — postal codes that qualify for Pacred's
 * free-shipping promo (BKK + Nonthaburi + Samut Prakan + Samut Sakhon
 * + Nakhon Pathom + Pathum Thani).
 *
 * Critical for forwarder/cart price calc — wrong zip lookup = wrong
 * total = customer dispute. Lock the behaviour with tests so future
 * refactors don't drift.
 *
 * Pattern matches lib/forwarder/calc-price.test.ts.
 */

import { isFreeShippingZip } from "./bkk-zip";

let pass = 0;
let fail = 0;

function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────
section("BKK central zips (10xxx) — free shipping");
// ────────────────────────────────────────────────────────────

assertEq("10100 (Phra Nakhon)",        isFreeShippingZip("10100"), true);
assertEq("10110 (Khlong Toei)",        isFreeShippingZip("10110"), true);
assertEq("10120 (Sathon)",             isFreeShippingZip("10120"), true);
assertEq("10200 (Khlong San)",         isFreeShippingZip("10200"), true);
assertEq("10240 (Bang Kapi)",          isFreeShippingZip("10240"), true);
assertEq("10330 (Pathum Wan)",         isFreeShippingZip("10330"), true);
assertEq("10500 (Bang Rak)",           isFreeShippingZip("10500"), true);
assertEq("10800 (Bang Sue)",           isFreeShippingZip("10800"), true);
assertEq("10900 (Chatuchak)",          isFreeShippingZip("10900"), true);

// ────────────────────────────────────────────────────────────
section("Metro provinces — free shipping");
// ────────────────────────────────────────────────────────────

assertEq("11000 (Nonthaburi central)",      isFreeShippingZip("11000"), true);
assertEq("11110 (Nonthaburi)",              isFreeShippingZip("11110"), true);
assertEq("11150 (Nonthaburi other district)", isFreeShippingZip("11150"), true);
assertEq("10130 (Samut Prakan)",            isFreeShippingZip("10130"), true);
assertEq("10270 (Samut Prakan)",            isFreeShippingZip("10270"), true);
assertEq("10540 (Samut Prakan)",            isFreeShippingZip("10540"), true);
assertEq("10560 (Samut Prakan)",            isFreeShippingZip("10560"), true);
assertEq("74000 (Samut Sakhon)",            isFreeShippingZip("74000"), true);
assertEq("74110 (Samut Sakhon)",            isFreeShippingZip("74110"), true);
assertEq("73110 (Nakhon Pathom)",           isFreeShippingZip("73110"), true);
assertEq("73170 (Nakhon Pathom)",           isFreeShippingZip("73170"), true);

// ────────────────────────────────────────────────────────────
section("Out-of-zone zips — NOT free shipping");
// ────────────────────────────────────────────────────────────

assertEq("50000 (Chiang Mai)",             isFreeShippingZip("50000"), false);
assertEq("80000 (Nakhon Si Thammarat)",    isFreeShippingZip("80000"), false);
assertEq("20000 (Chonburi)",               isFreeShippingZip("20000"), false);
assertEq("12000 (Pathum Thani — not in legacy list yet)", isFreeShippingZip("12000"), false);
assertEq("10999 (BKK range but not in list)", isFreeShippingZip("10999"), false);
assertEq("11200 (Nonthaburi range but not listed)", isFreeShippingZip("11200"), false);

// ────────────────────────────────────────────────────────────
section("Null/undefined/empty handling");
// ────────────────────────────────────────────────────────────

assertEq("null → false",            isFreeShippingZip(null),        false);
assertEq("undefined → false",       isFreeShippingZip(undefined),   false);
assertEq("empty string → false",    isFreeShippingZip(""),          false);
assertEq("whitespace-only → false", isFreeShippingZip("    "),      false);

// ────────────────────────────────────────────────────────────
section("Whitespace trim — should still match");
// ────────────────────────────────────────────────────────────

assertEq("' 10110 ' (padded) → true",     isFreeShippingZip(" 10110 "),    true);
assertEq("'\\t10110\\t' (tabs) → true",    isFreeShippingZip("\t10110\t"),  true);
assertEq("'\\n10110\\n' (newlines) → true", isFreeShippingZip("\n10110\n"), true);

// ────────────────────────────────────────────────────────────
section("Format strictness — string-typed lookup");
// ────────────────────────────────────────────────────────────

// The Set stores strings; ensure we don't accidentally match numerics or
// 4-digit padded versions. The current implementation casts via .map(String)
// so "10110" matches but "10110.0" or "10110 " (only padding) won't.

assertEq("'010110' (extra leading 0) → false", isFreeShippingZip("010110"),   false);
assertEq("'10110a' (suffix garbage) → false",  isFreeShippingZip("10110a"),   false);

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
