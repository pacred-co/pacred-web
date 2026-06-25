/**
 * PromptPay payload decode test — proves the dynamic amount-QR is EMVCo-correct
 * (right merchant tax-ID, right amount, valid CRC) WITHOUT needing a phone scan.
 * Run: tsx lib/promptpay-payload.test.ts
 */

import {
  composePromptPayPayload,
  parseEmvcoTlv,
  crc16ccitt,
  verifyPromptPayPayload,
  DEFAULT_PROMPTPAY_ID,
} from "./promptpay-payload";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
}

console.log("PromptPay payload — EMVCo decode/verify");

// ── 1. amount-encoded payload for the Pacred tax ID ──
const amount = 1234.5;
const p = composePromptPayPayload(DEFAULT_PROMPTPAY_ID, amount);
const t = parseEmvcoTlv(p);

ok("payload non-empty", p.length > 0);
ok("tag 00 (format) = 01", t["00"] === "01");
ok("tag 01 (POI) = 12 (dynamic, has amount)", t["01"] === "12");
ok("tag 53 (currency) = 764 (THB)", t["53"] === "764");
ok("tag 58 (country) = TH", t["58"] === "TH");
ok("tag 54 (amount) = 1234.50", t["54"] === "1234.50");
ok("tag 29 carries the PromptPay AID", (t["29"] ?? "").includes("A000000677010111"));
ok("tag 29 carries the tax ID 0105564077716", (t["29"] ?? "").includes("0105564077716"));
ok("CRC verifies", verifyPromptPayPayload(p));

// ── 2. amount-less (static) payload ──
const ps = composePromptPayPayload(DEFAULT_PROMPTPAY_ID);
const ts = parseEmvcoTlv(ps);
ok("static: tag 01 (POI) = 11 (no amount)", ts["01"] === "11");
ok("static: no tag 54 (amount)", ts["54"] === undefined);
ok("static: CRC verifies", verifyPromptPayPayload(ps));

// ── 3. guards + CRC sanity ──
ok("empty id → empty payload", composePromptPayPayload("") === "");
ok("amount<=0 → treated as static (no tag 54)", parseEmvcoTlv(composePromptPayPayload(DEFAULT_PROMPTPAY_ID, 0))["54"] === undefined);
ok("CRC16-CCITT known vector ('123456789' = 0x29B1)", crc16ccitt("123456789") === "29B1");
ok("tamper breaks CRC", !verifyPromptPayPayload(p.slice(0, 10) + (p[10] === "9" ? "8" : "9") + p.slice(11)));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
