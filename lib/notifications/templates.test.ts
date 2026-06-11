/**
 * Unit tests for lib/notifications/templates.ts — the typed NotifyPayload
 * builders (P-21).
 *
 * Each builder is pure: opts in, NotifyPayload out. The wording is
 * customer-facing, so these tests pin down: (a) the severity logic per
 * status, (b) the THB formatting helper, (c) deep-link routing that
 * branches on order ref prefix, (d) the truncation in contactMessage.
 *
 * Wording is NOT snapshotted verbatim — only the load-bearing bits
 * (severity, category, link_href, reference wiring, formatted amounts)
 * are asserted, so future copy tweaks don't break the suite.
 *
 * Harness: plain tsx script, matches lib/warehouse/cargo-type.test.ts.
 */

import { notify } from "./templates";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

function truthy(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * The internal thb() helper formats via toLocaleString("th-TH", …) — the
 * exact digit glyphs / grouping separator depend on the runtime's ICU
 * build, so tests must NOT assert a literal ASCII string. This mirrors
 * the production format with the same Intl call, so the assertion stays
 * correct regardless of which ICU ships.
 */
function thbExpected(n: number): string {
  return "฿" + Math.abs(Number(n)).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// ════════════════════════════════════════════════════════════════════
// customer lifecycle
// ════════════════════════════════════════════════════════════════════
console.log("\ncustomer lifecycle templates");

{
  const p = notify.customerApproved({ memberCode: "PR042" });
  eq("customerApproved category", p.category, "system");
  eq("customerApproved severity", p.severity, "success");
  truthy("customerApproved with code mentions code", p.body.includes("PR042"));
  eq("customerApproved link", p.link_href, "/dashboard");
}
{
  const p = notify.customerApproved({ memberCode: null });
  truthy("customerApproved null code → generic welcome body", p.body.length > 0 && !p.body.includes("null"));
}
{
  const p = notify.customerSuspended();
  eq("customerSuspended severity warning", p.severity, "warning");
}
{
  const p = notify.customerConvertedToJuristic({ displayName: "สมชาย", companyName: "เอบีซี จำกัด" });
  eq("juristic conversion severity", p.severity, "success");
  truthy("juristic body mentions company name", p.body.includes("เอบีซี จำกัด"));
  eq("juristic link", p.link_href, "/profile");
}

// ════════════════════════════════════════════════════════════════════
// sales rep transfer (3 sides)
// ════════════════════════════════════════════════════════════════════
console.log("\nsales rep transfer templates");

{
  const p = notify.salesRepTransferOutgoing({ customerLabel: "ลูกค้า A", reason: "ปรับทีม", customerId: "cid-1" });
  eq("transfer outgoing category sales", p.category, "sales");
  eq("transfer outgoing link", p.link_href, "/admin/customers/cid-1");
  truthy("transfer outgoing body has reason", p.body.includes("ปรับทีม"));
}
{
  const p = notify.salesRepTransferIncoming({ customerLabel: "ลูกค้า A", reason: "ปรับทีม", customerId: "cid-1" });
  eq("transfer incoming link", p.link_href, "/admin/customers/cid-1");
}
{
  const p = notify.salesRepReassignedCustomerNotice();
  eq("reassigned customer notice category system", p.category, "system");
  eq("reassigned customer notice severity info", p.severity, "info");
}

// ════════════════════════════════════════════════════════════════════
// wallet — severity-by-status logic + THB formatting
// ════════════════════════════════════════════════════════════════════
console.log("\nwallet templates — severity logic + thb()");

{
  const p = notify.walletTxStatusChanged({ kind: "deposit", status: "completed", amount: 1500, txId: "tx-1" });
  eq("wallet completed → success severity", p.severity, "success");
  eq("wallet reference_type", p.reference_type, "wallet_transaction");
  eq("wallet reference_id", p.reference_id, "tx-1");
  truthy("wallet body formats THB via thb() helper", p.body.includes(thbExpected(1500)));
  truthy("wallet title uses kind label ชำระเงิน", p.title.includes("ชำระเงิน"));
}
{
  const p = notify.walletTxStatusChanged({ kind: "withdraw", status: "failed", amount: 200, txId: "tx-2" });
  eq("wallet failed → warning severity", p.severity, "warning");
}
{
  const p = notify.walletTxStatusChanged({ kind: "withdraw", status: "cancelled", amount: 200, txId: "tx-3" });
  eq("wallet cancelled → warning severity", p.severity, "warning");
}
{
  const p = notify.walletTxStatusChanged({ kind: "deposit", status: "pending", amount: 200, txId: "tx-4" });
  eq("wallet pending → info severity", p.severity, "info");
}
{
  // unknown kind/status fall through to the raw value
  const p = notify.walletTxStatusChanged({ kind: "weird_kind", status: "weird_status", amount: 50, txId: "tx-5" });
  truthy("unknown kind label falls back to raw", p.title.includes("weird_kind"));
  eq("unknown status → info severity (not completed/failed)", p.severity, "info");
}
{
  // negative amount → thb() takes Math.abs
  const p = notify.walletTxStatusChanged({ kind: "adjustment", status: "completed", amount: -300, txId: "tx-6" });
  truthy("negative amount formatted as absolute value", p.body.includes(thbExpected(300)) && !p.body.includes("-"));
}
{
  const p = notify.walletTxStatusChanged({ kind: "deposit", status: "completed", amount: 100, note: "หมายเหตุพิเศษ", txId: "tx-7" });
  truthy("wallet note appended to body when present", p.body.includes("หมายเหตุพิเศษ"));
}
{
  const p = notify.walletDepositRequested({ amount: 1000, txId: "tx-8" });
  eq("deposit requested severity info", p.severity, "info");
  eq("deposit requested reference_id", p.reference_id, "tx-8");
}
{
  const p = notify.walletWithdrawRequested({ amount: 1000, txId: "tx-9" });
  eq("withdraw requested category wallet", p.category, "wallet");
  eq("withdraw requested link", p.link_href, "/wallet/history");
}

// ════════════════════════════════════════════════════════════════════
// forwarder
// ════════════════════════════════════════════════════════════════════
console.log("\nforwarder templates");

{
  const p = notify.forwarderStatusChanged({ fNo: "FW001", status: "in_transit", forwarderId: "fid-1" });
  eq("forwarder status → info severity", p.severity, "info");
  eq("forwarder link uses fNo", p.link_href, "/service-import/FW001");
  eq("forwarder reference_type", p.reference_type, "forwarder");
  truthy("forwarder body shows mapped status label", p.body.includes("กำลังขนส่ง"));
}
{
  const p = notify.forwarderStatusChanged({ fNo: "FW002", status: "cancelled", forwarderId: "fid-2" });
  eq("forwarder cancelled → warning severity", p.severity, "warning");
}
{
  const p = notify.forwarderCreated({ fNo: "FW003", forwarderId: "fid-3" });
  eq("forwarder created → success severity", p.severity, "success");
  eq("forwarder created link", p.link_href, "/service-import/FW003");
}

// ════════════════════════════════════════════════════════════════════
// service order
// ════════════════════════════════════════════════════════════════════
console.log("\nservice-order templates");

{
  const p = notify.serviceOrderStatusChanged({ hNo: "H123", status: "processing", orderId: "oid-1" });
  eq("service order status → info severity", p.severity, "info");
  eq("service order link uses hNo", p.link_href, "/service-order/H123");
}
{
  const p = notify.serviceOrderStatusChanged({ hNo: "H124", status: "cancelled", orderId: "oid-2" });
  eq("service order cancelled → warning severity", p.severity, "warning");
}
{
  const p = notify.serviceOrderPlaced({ hNo: "H125", orderId: "oid-3", itemCount: 3, totalThb: 4500 });
  eq("service order placed → success severity", p.severity, "success");
  truthy("service order placed body has item count", p.body.includes("3"));
  truthy("service order placed body formats total via thb()", p.body.includes(thbExpected(4500)));
}

// ════════════════════════════════════════════════════════════════════
// yuan payment
// ════════════════════════════════════════════════════════════════════
console.log("\nyuan-payment templates");

{
  const p = notify.yuanPaymentStatusChanged({ status: "completed", thbAmount: 7000, paymentId: "pid-1" });
  eq("yuan completed → success severity", p.severity, "success");
  eq("yuan completed title", p.title, "โอนหยวนสำเร็จ");
}
{
  const p = notify.yuanPaymentStatusChanged({ status: "rejected", thbAmount: 7000, paymentId: "pid-2" });
  eq("yuan rejected → warning severity", p.severity, "warning");
  eq("yuan rejected title", p.title, "โอนหยวนไม่สำเร็จ");
}
{
  const p = notify.yuanPaymentStatusChanged({ status: "reviewing", thbAmount: 7000, paymentId: "pid-3" });
  eq("yuan other status → info severity", p.severity, "info");
}
{
  const p = notify.yuanPaymentRequested({ thbAmount: 7000, paymentId: "pid-4" });
  eq("yuan requested category", p.category, "yuan_payment");
  eq("yuan requested link", p.link_href, "/service-payment");
}

// ════════════════════════════════════════════════════════════════════
// sales payout
// ════════════════════════════════════════════════════════════════════
console.log("\nsales-payout template");

{
  const p = notify.salesPayoutRequested({ amountTotal: 12000, payoutId: "po-1" });
  eq("sales payout category", p.category, "sales");
  eq("sales payout reference_type", p.reference_type, "sales_payout");
  truthy("sales payout body formats amount via thb()", p.body.includes(thbExpected(12000)));
}

// ════════════════════════════════════════════════════════════════════
// contact message — truncation at 120 chars
// ════════════════════════════════════════════════════════════════════
console.log("\ncontact-message template — truncation");

{
  const p = notify.contactMessageReceived({
    name: "คุณเอ", contact: "0812345678", messagePreview: "สั้น", messageId: "m-1",
  });
  truthy("short preview kept verbatim, no ellipsis", p.body.includes("สั้น") && !p.body.includes("..."));
  eq("contact message link", p.link_href, "/admin/contact-messages");
}
{
  const long = "x".repeat(200);
  const p = notify.contactMessageReceived({
    name: "คุณบี", contact: "me@x.co", messagePreview: long, messageId: "m-2",
  });
  truthy("long preview truncated with ellipsis", p.body.includes("..."));
  truthy("long preview body does not contain full 200-char string", !p.body.includes("x".repeat(200)));
}
{
  // exactly 120 chars — at the boundary, no truncation (slice only when > 120)
  const exactly120 = "y".repeat(120);
  const p = notify.contactMessageReceived({
    name: "คุณซี", contact: "me@x.co", messagePreview: exactly120, messageId: "m-3",
  });
  truthy("exactly-120 preview NOT truncated", !p.body.includes("..."));
}

// ════════════════════════════════════════════════════════════════════
// sales digest + sms balance low
// ════════════════════════════════════════════════════════════════════
console.log("\ncron-driven templates");

{
  const p = notify.salesDigest({ yyyymmdd: "2026-05-18", message: "ยอดวันนี้ 50000" });
  eq("sales digest category", p.category, "sales_digest");
  truthy("sales digest title has date", p.title.includes("2026-05-18"));
  eq("sales digest body is passthrough", p.body, "ยอดวันนี้ 50000");
}
{
  const p = notify.smsBalanceLow({ balance: 120, unit: "messages", threshold: 500 });
  eq("sms balance low → warning severity", p.severity, "warning");
  // balance goes through toLocaleString (locale-dependent glyphs); threshold
  // is plain interpolation. Assert the locale-formatted balance + raw threshold.
  truthy(
    "sms balance low body has balance + threshold",
    p.body.includes((120).toLocaleString("th-TH")) && p.body.includes("500"),
  );
  eq("sms balance low link", p.link_href, "/admin");
}

// ════════════════════════════════════════════════════════════════════
// tax invoice — link routing branches on order ref prefix
// ════════════════════════════════════════════════════════════════════
console.log("\ntax-invoice templates — order ref routing");

{
  const p = notify.taxInvoiceIssued({ serialNo: "INV-001", totalThb: 9999, orderRef: "ON123" });
  eq("tax invoice issued severity", p.severity, "success");
  eq("ON-prefixed ref → service-order receipt link", p.link_href, "/service-order/ON123/receipt");
  truthy("tax invoice body formats total via thb()", p.body.includes(thbExpected(9999)));
}
{
  const p = notify.taxInvoiceIssued({ serialNo: "INV-002", totalThb: 100, orderRef: "FW999" });
  eq("non-ON ref → service-import invoice link", p.link_href, "/service-import/FW999/invoice");
}
{
  const p = notify.taxInvoiceCancelled({ serialNo: "INV-003", reason: "ขอใหม่", orderRef: "ON555" });
  eq("tax invoice cancelled severity warning", p.severity, "warning");
  eq("cancelled ON ref → service-order receipt link", p.link_href, "/service-order/ON555/receipt");
  truthy("cancelled body has reason", p.body.includes("ขอใหม่"));
}
{
  const p = notify.taxInvoiceCancelled({ serialNo: "INV-004", reason: "ผิด", orderRef: "FW111" });
  eq("cancelled non-ON ref → service-import invoice link", p.link_href, "/service-import/FW111/invoice");
}

// ════════════════════════════════════════════════════════════════════
// QA inspection — outcome → severity
// ════════════════════════════════════════════════════════════════════
console.log("\nQA inspection template");

{
  const p = notify.qaFailed({ shipmentCode: "SH1", inspectionNo: "QA1", outcome: "fail_major", notes: "เสียหาย" });
  eq("qa fail_major → error severity", p.severity, "error");
  eq("qa link uses shipment code", p.link_href, "/shipments/SH1");
  truthy("qa body has notes + inspection no", p.body.includes("เสียหาย") && p.body.includes("QA1"));
}
{
  const p = notify.qaFailed({ shipmentCode: "SH2", inspectionNo: "QA2", outcome: "fail_minor", notes: "" });
  eq("qa fail_minor → warning severity", p.severity, "warning");
  truthy("qa empty notes → still references inspection no", p.body.includes("QA2"));
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n  ${pass} pass · ${fail} fail`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
