/**
 * Unit tests for lib/forwarder/forwarder-collect-total.ts
 * (UNIT C · forwarder customer SELF-PAY · 2026-06-19).
 *
 * Asserts the CUSTOMER self-pay collect contract ported from legacy
 * `member/include/pages/forwarder/calPrice.php` L25-45 (mirrored in
 * `actions/forwarder.ts calculateForwarderTotal` L111-179):
 *   • per-row composite total formula (L26)
 *   • PCSF-zero row → +฿50 flat batch fee (L29-42)
 *   • หนองแขม district × userNotPCS50 allowlist → NO +50 (L34-38)
 *   • juristic (userCompany='1') → 1% reduction on ANY positive total (L43-45 ·
 *     owner 2026-07-22: the ฿1,000 minimum was abolished)
 *   • non-juristic → NO 1%
 *
 * The whole point of this helper is killing BUG-2 — display == charge — so the
 * assertions below double as the regression lock.
 *
 * Harness: plain `tsx` (no vitest) · pass/fail counters · matches
 * lib/forwarder/forwarder-debit-total.test.ts style.
 */

import {
  computeForwarderCollectTotal,
  userNotPCS50,
  type ForwarderCollectRow,
} from "./forwarder-collect-total";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function assertClose(label: string, actual: number, expected: number, eps = 0.005) {
  if (Math.abs(actual - expected) <= eps) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

/** Build a ForwarderCollectRow with sane zero defaults. */
function row(p: Partial<ForwarderCollectRow> = {}): ForwarderCollectRow {
  return {
    fshipby: p.fshipby ?? "Flash",
    ftransportprice: p.ftransportprice ?? 0,
    paymethod: p.paymethod ?? null,
    faddressdistrict: p.faddressdistrict ?? null,
    ftotalprice: p.ftotalprice ?? 0,
    fpriceupdate: p.fpriceupdate ?? 0,
    fshippingservice: p.fshippingservice ?? 0,
    pricecrate: p.pricecrate ?? 0,
    ftransportpricechnthb: p.ftransportpricechnthb ?? 0,
    priceother: p.priceother ?? 0,
    fdiscount: p.fdiscount ?? 0,
  };
}

console.log("forwarder-collect-total:");

// 1. A NORMAL row — composite total formula, no PCSF, no juristic.
{
  const r = computeForwarderCollectTotal(
    [row({
      ftotalprice: "100",
      ftransportprice: "20",
      fpriceupdate: "10",
      fshippingservice: "5",
      pricecrate: "3",
      ftransportpricechnthb: "2",
      priceother: "1",
      fdiscount: "11",
    })],
    { userId: "PR130", userCompany: "0" },
  );
  // 100 + 20 + 10 + 5 + 3 + 2 + 1 - 11 = 130
  assertClose("normal row composite total = 130", r.total, 130);
  assertEq("normal row no +50", r.applied50, false);
  assertEq("normal row no 1%", r.appliedWht, false);
  assertEq("normal row countPCSF = 0", r.countPCSF, 0);
}

// 2. A PCSF-zero row → +฿50 flat fee.
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "45.10" })],
    { userId: "PR131", userCompany: "0" },
  );
  // 45.10 + 100 = 145.10
  assertClose("PCSF-zero row total = freight + 100 (เหมาๆ)", r.total, 145.1);
  assertEq("PCSF-zero row applied50", r.applied50, true);
  assertEq("PCSF-zero row countPCSF = 1", r.countPCSF, 1);
}

// 3. A หนองแขม row + an exempt (allowlist) user → NO +50.
{
  const exemptUser = "PR50"; // on userNotPCS50
  assertEq("PR50 is on the allowlist", userNotPCS50.has(exemptUser), true);
  const r = computeForwarderCollectTotal(
    [row({
      fshipby: "PCSF",
      ftransportprice: 0,
      ftotalprice: "45.10",
      faddressdistrict: "แขวงหนองแขม เขตหนองแขม",
    })],
    { userId: exemptUser, userCompany: "0" },
  );
  // PCSF count 1, then หนองแขม+allowlist un-counts → 0 → NO +50.
  assertClose("หนองแขม + exempt user → NO +50, total = freight", r.total, 45.1);
  assertEq("หนองแขม + exempt user → applied50 false", r.applied50, false);
  assertEq("หนองแขม + exempt user → countPCSF = 0", r.countPCSF, 0);
}

// 3b. A หนองแขม row but a NON-allowlist user → +50 STILL applies (exemption needs both).
{
  const r = computeForwarderCollectTotal(
    [row({
      fshipby: "PCSF",
      ftransportprice: 0,
      ftotalprice: "45.10",
      faddressdistrict: "แขวงหนองแขม เขตหนองแขม",
    })],
    { userId: "PR9999", userCompany: "0" }, // NOT on the allowlist
  );
  assertClose("หนองแขม but non-allowlist user → +100 applies", r.total, 145.1);
  assertEq("หนองแขม but non-allowlist user → applied50 true", r.applied50, true);
}

// 4. userCompany='1' → 1% off (any positive amount).
{
  const r = computeForwarderCollectTotal(
    [row({ ftotalprice: "1000", fpriceupdate: "200" })],
    { userId: "PR140", userCompany: "1" },
  );
  // 1200, juristic → 1% off = 1188
  assertClose("juristic → 1% off, total = 1188", r.total, 1188);
  assertEq("juristic → appliedWht true", r.appliedWht, true);
}

// 5. userCompany='1' AND total < 1000 → 1% off (owner 2026-07-22: no minimum).
{
  const r = computeForwarderCollectTotal(
    [row({ ftotalprice: "500" })],
    { userId: "PR141", userCompany: "1" },
  );
  assertClose("juristic < 1000 → 1% off (no minimum), total = 495", r.total, 495);
  assertEq("juristic < 1000 → appliedWht true", r.appliedWht, true);
}

// 6. non-juristic (userCompany != '1') AND total >= 1000 → NO 1%.
{
  const r = computeForwarderCollectTotal(
    [row({ ftotalprice: "1000", fpriceupdate: "200" })],
    { userId: "PR142", userCompany: "0" },
  );
  assertClose("non-juristic >= 1000 → NO 1%, total = 1200", r.total, 1200);
  assertEq("non-juristic >= 1000 → appliedWht false", r.appliedWht, false);
}

// 7. Combined: เหมาๆ +100 lifts a 960 personal order to 1060 — but personal so NO 1%.
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "960" })],
    { userId: "PR143", userCompany: "0" },
  );
  assertClose("เหมาๆ +100 → 1060, personal → no 1%", r.total, 1060);
  assertEq("applied50 true", r.applied50, true);
  assertEq("appliedWht false (personal)", r.appliedWht, false);
}

// 8. Combined juristic: เหมาๆ +100 pushes a 980 juristic order over 1000 → 1% on 1080.
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "PRF", ftransportprice: 0, ftotalprice: "980" })],
    { userId: "PR144", userCompany: "1" },
  );
  // 980 + 100 = 1080 → >= 1000 → 1% off = 1069.20  (also asserts PRF alias)
  assertClose("เหมาๆ +100 lifts juristic over 1000 → 1% on 1080 = 1069.20", r.total, 1069.2);
  assertEq("applied50 true", r.applied50, true);
  assertEq("appliedWht true", r.appliedWht, true);
}

// 9. Multiple เหมาๆ-zero rows → still ONE flat +100 (not per-row).
{
  const r = computeForwarderCollectTotal(
    [
      row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "100" }),
      row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "200" }),
    ],
    { userId: "PR145", userCompany: "0" },
  );
  // 100 + 200 + 100 (one flat) = 400
  assertClose("two เหมาๆ-zero rows → ONE +100 → 400", r.total, 400);
  assertEq("countPCSF = 2", r.countPCSF, 2);
  assertEq("applied50 true (count >= 1)", r.applied50, true);
}

// 10. COD guard — a ปลายทาง (paymethod='2') row's ftransportprice is collected
//     at the door, so it is EXCLUDED from the upfront collect total.
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "2", paymethod: "2", ftotalprice: "300", ftransportprice: "80" })],
    { userId: "PR146", userCompany: "0" },
  );
  // 300 only — the ฿80 domestic leg is COD (at the door), not billed upfront.
  assertClose("COD row → domestic leg (80) NOT billed upfront → 300", r.total, 300);
}

// 10b. Prepaid (paymethod='1') row — domestic leg IS billed (unchanged behaviour).
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "PCSE", paymethod: "1", ftotalprice: "300", ftransportprice: "80" })],
    { userId: "PR147", userCompany: "0" },
  );
  assertClose("prepaid row → domestic leg (80) billed → 380", r.total, 380);
}

// 10c. COD guard drops ONLY the domestic leg — freight/crate/other/discount intact.
{
  const r = computeForwarderCollectTotal(
    [row({
      fshipby: "2", paymethod: "2",
      ftotalprice: "300", ftransportprice: "80",
      pricecrate: "50", ftransportpricechnthb: "20", priceother: "10", fdiscount: "5",
    })],
    { userId: "PR148", userCompany: "0" },
  );
  // 300 + (80 dropped) + 50 + 20 + 10 - 5 = 375
  assertClose("COD guard zeroes ONLY the domestic leg → 375", r.total, 375);
}

// ────────────────────────────────────────────────────────────
// G2 (2026-07-08) — the customer-facing NOTIFY (forwarder-check bulk-bill
// SMS/LINE) must quote the SAME collect total this helper produces (the
// portal charge), NOT the per-row calcForwarderOutstanding it used before.
// And the ใบวางบิล (createBillingRunInvoice) must be a legitimate SUPERSET
// of that collect — collect + bill-level extras (the COD legs it bills
// upfront) — never a conflicting number.
// ────────────────────────────────────────────────────────────

// The bill money math imports (pure — no server-only):
//   bill GROSS per row = calcForwarderGross (Σ 7 cols − discount, NO COD guard)
//   bill เหมาๆ         = MAO_FLAT_FEE once when a เหมาๆ-zero row is present
import { calcForwarderGross } from "./outstanding";
import { MAO_FLAT_FEE, isMaoCarrier } from "./mao-fee";

// A mixed billed set for one juristic customer, one shipment:
//   A — PRF เหมาๆ, ftransportprice 0, ftotalprice 500 (prepaid)
//   B — PCS,       ftotalprice 600, ftransportprice 80 (prepaid)
//   C — PCS,       ftotalprice 300, ftransportprice 50, COD (paymethod='2')
const mixedSet: ForwarderCollectRow[] = [
  row({ fshipby: "PRF", ftransportprice: 0,  ftotalprice: "500" }),
  row({ fshipby: "PCS", ftransportprice: 80, ftotalprice: "600", paymethod: "1" }),
  row({ fshipby: "PCS", ftransportprice: 50, ftotalprice: "300", paymethod: "2" }),
];

// 11. NOTIFY == PORTAL — the number the bulk-bill SMS/LINE now quotes.
{
  // collect = 500 + 680(B: 600+80) + 300(C: COD ฿50 leg excluded) = 1480
  //         + เหมาๆ 100 = 1580 ; juristic & ≥1000 → −1% = 1564.20
  const collect = computeForwarderCollectTotal(mixedSet, { userId: "PR100", userCompany: "1" });
  assertClose("G2 notify quotes the portal collect = 1564.20", collect.total, 1564.2);
  assertEq("G2 collect applied เหมาๆ", collect.applied50, true);
  assertEq("G2 collect applied 1%", collect.appliedWht, true);
  // The forwarder-check bulk-bill feeds this exact set to computeForwarderCollectTotal,
  // so the SMS/LINE amount == this value == what the portal charges for the same set.
}

// 12. BILL ⊇ COLLECT — the ใบวางบิล gross is the collect + the bill-level
//     extras (the COD domestic leg the bill bills upfront but the collect
//     defers to the courier's door). Proves the bill is a SUPERSET, not a
//     conflicting number.
{
  const nonJuristic = { userId: "PR100", userCompany: "0" };
  // (a) All-prepaid, single-shipment, ≥฿1000 → arithmetic identity:
  //     bill gross (Σ calcForwarderGross + เหมาๆ) == collect gross (no COD, no 1%).
  const prepaidSet: ForwarderCollectRow[] = [
    row({ fshipby: "PRF", ftransportprice: 0,  ftotalprice: "500" }),
    row({ fshipby: "PCS", ftransportprice: 80, ftotalprice: "600", paymethod: "1" }),
  ];
  const billGrossPrepaid =
    prepaidSet.reduce((s, r) => s + calcForwarderGross({ ...r, fusercompany: null }), 0) +
    (prepaidSet.some((r) => isMaoCarrier(r.fshipby) && Number(r.ftransportprice) === 0)
      ? MAO_FLAT_FEE
      : 0);
  const collectPrepaid = computeForwarderCollectTotal(prepaidSet, nonJuristic);
  assertClose("G2 bill gross == collect (all-prepaid, no extras)", billGrossPrepaid, collectPrepaid.total);

  // (b) Add a COD row → D1 (2026-07-13): calcForwarderGross now reads paymethod, so a
  //     COD (ปลายทาง) row's ftransportprice (the at-door leg the courier collects) is
  //     EXCLUDED from the bill just as the collect excludes it. So bill gross == collect —
  //     they AGREE (the domestic leg is no longer double-billed: once on the bill + once
  //     by the courier). Was: bill INCLUDED it (no COD guard) → bill = collect + ฿50.
  const billGrossMixed =
    mixedSet.reduce((s, r) => s + calcForwarderGross({ ...r, fusercompany: null }), 0) +
    (mixedSet.some((r) => isMaoCarrier(r.fshipby) && Number(r.ftransportprice) === 0)
      ? MAO_FLAT_FEE
      : 0);
  const collectMixed = computeForwarderCollectTotal(mixedSet, nonJuristic); // non-juristic → no 1% noise
  assertClose(
    "D1: bill gross == collect (both exclude the COD domestic leg — no double-bill)",
    billGrossMixed,
    collectMixed.total,
  );
}

console.log(`\nforwarder-collect-total: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
