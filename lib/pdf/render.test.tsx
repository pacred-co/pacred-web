/**
 * U1-8 — PDF render smoke test for Thai special characters.
 *
 * Per chat audit L-5 (mPDF brittleness): Thai addresses with combining
 * vowel marks / repetition mark ๆ / paiyannoi ฯ / vocalic ฤ ฦ used to
 * render as squares. Pacred uses @react-pdf/renderer + Sarabun font;
 * this test asserts that suspicion-prone characters render WITHOUT
 * throwing OR producing empty buffers.
 *
 * Test surface (no DB):
 *   1. TaxInvoice — base + cancelled (watermark) variant
 *   2. ShopOrderReceipt + FreightReceipt
 *
 * (ForwarderReceipt PDF removed 2026-06-02 — the forwarder receipt PDF route
 *  + component were a dead orphan stack reading the rebuilt 0-row `forwarders`
 *  table. The live forwarder ใบแจ้งหนี้ is the HTML page at
 *  /service-import/[fNo]/invoice — see ADR-0027.)
 *
 * What "passing" means:
 *   - renderToBuffer resolves to a Buffer
 *   - Buffer length > 1500 bytes (a rendered PDF baseline; empty/error
 *     buffers are typically <500)
 *   - Buffer starts with %PDF- magic (valid PDF header)
 *
 * Render is the slowest test in the unit bucket (~1-2s each = ~5s total)
 * — that's the cost of validating the L-5 audit gap before customers
 * report broken receipts.
 */

import path from "node:path";
import { Font, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { TaxInvoice, type TaxInvoiceData } from "@/components/pdf/tax-invoice";
import { ShopOrderReceipt } from "@/components/pdf/shop-order-receipt";
import { FreightReceipt, type FreightReceiptData } from "@/components/pdf/freight-receipt";
import type { ShopOrderReceiptData } from "@/actions/service-order";

// Inline font registration mirroring lib/pdf/register-fonts.ts (avoid
// importing it because it depends on `server-only` which is a Next.js
// virtual module unavailable in raw tsx).
function registerSarabunForTest(): void {
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Sarabun",
    fonts: [
      { src: path.join(fontsDir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(fontsDir, "Sarabun-Bold.ttf"),    fontWeight: "bold"   },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

// ── Edge Thai-character bank (per chat L-5 audit) ──
const EDGE_NAME    = "บริษัท แพคเรด (ประเทศไทย) จำกัด ฯ";
const EDGE_ADDRESS = [
  "เลขที่ ๒๓๔/๕ ซอยริมคลองฤๅษี",          // Thai numerals + ฤ
  "ถนนสุขุมวิท ๖๒/๑ แขวงพระโขนง ๆ ที่ ๒",  // ๆ repetition mark
  "เขตคลองเตย กรุงเทพมหานคร ๑๐๒๖๐ ฯลฯ",   // ฯลฯ paiyannoi-noi
  "(อาคาร เอ ชั้น ๓ ห้อง ๓๐๑ ก่ก้ก๊ก๋)",     // combining-mark stress test
].join("\n");
const EDGE_BUYER_TAX_ID = "0105560123459";

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

function baseTaxInvoice(): TaxInvoiceData {
  return {
    serial_no:    "INV-202605-0001",
    status:       "issued",
    issued_at:    "2026-05-16T10:30:00Z",
    created_at:   "2026-05-16T10:00:00Z",
    buyer_name:    "บริษัท ตัวอย่าง จำกัด",
    buyer_address: "123 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110",
    buyer_tax_id:  "0105560123459",
    buyer_branch:  "สำนักงานใหญ่",
    subtotal_thb:  1822.43,
    vat_thb:       127.57,
    total_thb:     1950.00,
    vat_mode:      "inclusive",
    payment_method: "Wallet",
    lines: [
      {
        position: 1,
        description: "ฝากนำเข้า F260516001 — yiwu/truck — 5 กล่อง",
        qty: 1,
        unit_price_thb: 1822.43,
        amount_thb:     1822.43,
        vat_thb:        127.57,
      },
    ],
    order_h_no:     null,
    forwarder_f_no: "F260516001",
  };
}

function edgeTaxInvoice(): TaxInvoiceData {
  const t = baseTaxInvoice();
  t.buyer_name    = EDGE_NAME;
  t.buyer_address = EDGE_ADDRESS;
  t.buyer_tax_id  = EDGE_BUYER_TAX_ID;
  return t;
}

function cancelledTaxInvoice(): TaxInvoiceData {
  const t = baseTaxInvoice();
  t.status = "cancelled";
  return t;
}

// ── ShopOrderReceipt fixtures (LP-6 coverage) ──
function baseShopOrder(): ShopOrderReceiptData {
  return {
    h_no:                  "ONS260516-001",
    // Legacy tb_header_order.hstatus code: '5' = สำเร็จ (completed/paid).
    status:                "5",
    created_at:            "2026-05-16T09:00:00Z",
    date_awaiting_payment: "2026-05-16T09:30:00Z",
    payment_due_at:        "2026-05-23T09:30:00Z",
    date_completed:        "2026-05-16T11:00:00Z",
    yuan_rate_locked:      5.1234,
    subtotal_cny:          200,
    domestic_china_cny:    50,
    service_fee:           50,
    total_thb:             1330,
    free_shipping:         false,
    crate:                 false,
    warehouse_china:       "guangzhou",
    transport_type:        "truck",
    bill_to_name_override: null,
    ship_first_name:       "สมหญิง",
    ship_last_name:        "พร้อมส่ง",
    ship_phone:            "0823456789",
    ship_phone2:           null,
    ship_address_line:     "456 ถนนพหลโยธิน",
    ship_sub_district:     "จตุจักร",
    ship_district:         "จตุจักร",
    ship_province:         "กรุงเทพฯ",
    ship_postal_code:      "10900",
    customer: {
      member_code:     "PR042",
      first_name:      "สมหญิง",
      last_name:       "พร้อมส่ง",
      email:           "test@pacred.test",
      phone:           "0823456789",
      account_type:    "personal",
      company_name:    null,
      tax_id:          null,
      company_address: null,
    },
    items: [
      {
        id:                  "i1",
        provider:            "1688",
        shop_name:           "Test Shop 测试",
        title:               "เสื้อยืดสีดำ ขนาด L",
        color:               "ดำ",
        size:                "L",
        price_cny:           50,
        amount:              4,
        domestic_china_cny:  50,
        shipping_number:     "1688-ORDER-12345",
        tracking_number:     "SF1234567890",
      },
    ],
  };
}

function juristicShopOrderWithOverride(): ShopOrderReceiptData {
  const o = baseShopOrder();
  o.bill_to_name_override = "บริษัท ผู้ซื้อจริง จำกัด ฯ";  // V-C2 override
  o.customer = {
    ...o.customer,
    account_type:    "juristic",
    company_name:    EDGE_NAME,
    tax_id:          EDGE_BUYER_TAX_ID,
    company_address: EDGE_ADDRESS,
  };
  o.items = [
    { id: "i1", provider: "1688",   shop_name: "Shop A 商店",   title: "เสื้อยืดสั่งทำ ฯลฯ ๒๓ สี",      color: "ดำ ก่ก้",         size: "XXL",      price_cny: 89.5,  amount: 100, domestic_china_cny: 200, shipping_number: "12345", tracking_number: null },
    { id: "i2", provider: "taobao", shop_name: "Shop B ロト",    title: "หน้ากากผ้าฤดูร้อน",            color: null,             size: null,        price_cny: 35.5,  amount: 50,  domestic_china_cny: null as unknown as number, shipping_number: null,    tracking_number: "TH987654321" },
  ];
  return o;
}

function pendingShopOrder(): ShopOrderReceiptData {
  const o = baseShopOrder();
  // Legacy hstatus code: '2' = รอชำระเงิน (awaiting payment → renders as ใบแจ้งหนี้).
  o.status = "2";
  o.date_completed = null;
  return o;
}

// ── FreightReceipt fixtures (V-E7 coverage) ──
function baseFreightReceipt(): FreightReceiptData {
  return {
    invoice_no:      "FI260517-0001",
    status:          "issued",
    payment_status:  "partial",
    issued_at:       "2026-05-17T10:00:00Z",
    created_at:      "2026-05-17T09:00:00Z",
    job_no:          "A2600017",
    buyer_name:      "บริษัท นำเข้า ตัวอย่าง จำกัด",
    buyer_address:   "99/9 ถนนพระราม 2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150",
    buyer_tax_id:    "0105560123459",
    buyer_branch:    "สำนักงานใหญ่",
    subtotal_thb:    340000,
    duty_thb:        17000,
    vat_thb:         24990,
    total_thb:       381990,
    paid_thb:        200000,
    outstanding_thb: 181990,
    lines: [
      { position: 1, description: "ค่าขนส่งทางเรือ FCL 20' จีน → ไทย", qty: 1,  unit: "LO",  amount_thb: 280000 },
      { position: 2, description: "ค่าดำเนินพิธีการศุลกากร ฯลฯ",        qty: 1,  unit: "PCS", amount_thb: 60000  },
    ],
    payments: [
      { method: "โอนผ่านธนาคาร", amount_thb: 200000, paid_at: "2026-05-17T11:00:00Z", bank_ref: "KBANK-001" },
    ],
  };
}

function paidFreightReceipt(): FreightReceiptData {
  const r = baseFreightReceipt();
  r.payment_status  = "paid";
  r.paid_thb        = 381990;
  r.outstanding_thb = 0;
  r.payments = [
    { method: "โอนผ่านธนาคาร", amount_thb: 200000, paid_at: "2026-05-17T11:00:00Z", bank_ref: "KBANK-001" },
    { method: "เงินสด",        amount_thb: 181990, paid_at: "2026-05-18T09:30:00Z", bank_ref: null },
  ];
  return r;
}

function cancelledFreightReceipt(): FreightReceiptData {
  const r = baseFreightReceipt();
  r.status = "cancelled";
  return r;
}

function edgeFreightReceipt(): FreightReceiptData {
  const r = baseFreightReceipt();
  r.buyer_name    = EDGE_NAME;
  r.buyer_address = EDGE_ADDRESS;
  r.buyer_tax_id  = EDGE_BUYER_TAX_ID;
  r.lines = [
    { position: 1, description: "ค่าขนส่งสินค้าฤดูร้อน ๒๓ ลัง ฯลฯ", qty: 23, unit: "CTN", amount_thb: 340000 },
  ];
  return r;
}

// ────────────────────────────────────────────────────────────
// Run tests
// ────────────────────────────────────────────────────────────

const PDF_MAGIC = Buffer.from("%PDF-");

async function renderAndAssert(label: string, doc: ReactElement<DocumentProps>): Promise<void> {
  try {
    const buf = await renderToBuffer(doc);
    const isPdf  = buf.length >= PDF_MAGIC.length && buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
    const sized  = buf.length > 1500;
    assert(`${label} — renderToBuffer resolves`,         true);
    assert(`${label} — buffer length > 1500 (${buf.length})`, sized);
    assert(`${label} — buffer starts with %PDF- magic`,  isPdf);
  } catch (e) {
    assert(`${label} — renderToBuffer resolves (got: ${(e as Error).message})`, false);
  }
}

(async () => {
  console.log("PDF render — Thai special-char smoke (U1-8)");

  // Sarabun registered once globally — react-pdf caches.
  registerSarabunForTest();

  console.log("  TaxInvoice");
  await renderAndAssert("base issued",      <TaxInvoice data={baseTaxInvoice()} />);
  await renderAndAssert("edge Thai chars",  <TaxInvoice data={edgeTaxInvoice()} />);
  await renderAndAssert("cancelled (watermark)", <TaxInvoice data={cancelledTaxInvoice()} />);

  console.log("  ShopOrderReceipt (LP-6)");
  await renderAndAssert("paid (personal)",                          <ShopOrderReceipt data={baseShopOrder()} />);
  await renderAndAssert("invoice (awaiting_payment)",               <ShopOrderReceipt data={pendingShopOrder()} />);
  await renderAndAssert("juristic + V-C2 override + edge Thai",     <ShopOrderReceipt data={juristicShopOrderWithOverride()} />);

  console.log("  FreightReceipt (V-E7)");
  await renderAndAssert("issued — partial paid",        <FreightReceipt data={baseFreightReceipt()} />);
  await renderAndAssert("paid (RECEIVED stamp)",        <FreightReceipt data={paidFreightReceipt()} />);
  await renderAndAssert("cancelled (watermark)",        <FreightReceipt data={cancelledFreightReceipt()} />);
  await renderAndAssert("edge Thai chars",              <FreightReceipt data={edgeFreightReceipt()} />);

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
})();
