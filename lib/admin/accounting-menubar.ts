/**
 * Shared accounting top-menubar config.
 *
 * Extracted 2026-05-26 (Wave 20 fix) from `app/[locale]/(admin)/admin/accounting/cargo/page.tsx`
 * so that both `/admin/accounting` (the dashboard ภูม wants as the
 * sidebar's "ระบบบัญชี" landing) AND any other accounting hubs can share
 * the same menubar chrome.
 *
 * Modelled on legacy `acc-system-cargo.php` header-menu/index.php — purple
 * gradient bar with 3-level cascading dropdowns. Leaf URLs point at
 * quotation / deposit / invoice / receipt / etc. sub-pages — many of which
 * don't exist as routes yet (they 404 by virtue of not existing, per
 * ภูม's approved Q3). Future agents fill out the leaves.
 *
 * Owner brief 2026-05-20 night: Pacred sidebar is too crowded — pushing
 * accounting depth into a TOP menubar (legacy pattern) frees the sidebar
 * for high-level navigation only.
 */

import type { MenubarItem } from "@/components/admin/page-top-menubar";

// ── Per-service status leaves common to ใบเสนอราคา / ใบรับเงินมัดจำ /
// ใบแจ้งหนี้ / ใบเสร็จ / ใบลดหนี้ / ใบเพิ่มหนี้ / ใบวางบิล. Each invoice-
// type has 4 services × 5 statuses (or 4-5 depending on the invoice
// type) — a small builder keeps the tree readable.

type Svc = { label: string; slug: string };

const SERVICES: Svc[] = [
  { label: "ฝากสั่งซื้อสินค้า",    slug: "shop" },
  { label: "ฝากนำเข้า แบบเรทราคา", slug: "forwarder-rate" },
  { label: "ฝากนำเข้า แบบรายการ",  slug: "forwarder-item" },
  { label: "ฝากโอนหยวน",          slug: "payment" },
];

// Used for quotation / deposit (5 statuses incl. "สร้าง").
function quotationStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",      href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}/new` },
      { label: "รอตอบรับ",   href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}?status=pending` },
      { label: "ยอมรับ",     href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}?status=accepted` },
      { label: "พ้นกำหนด",   href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}?status=expired` },
      { label: "ดูทั้งหมด",   href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}` },
    ],
  }));
}

// Used for invoice (5 statuses but slightly different labels — รอชำระเงิน / ชำระแล้ว / พ้นกำหนด).
//
// ── 2026-05-30 ภูม flagged #7 (ROUTING FIX) ──
// PREVIOUSLY (Wave 28 · commit db473a5e): the invoice → ฝากนำเข้า แบบเรทราคา /
// ฝากนำเข้า แบบรายการ leaves routed to /admin/accounting/forwarder-invoice.
// That destination was BUILT as "ใบแจ้งหนี้" in Wave 28 F3, then PIVOTED in
// Wave 29 P0 (#206+#208) to "ใบเสร็จ" — because legacy "ใบแจ้งหนี้" workflow
// was a UI stub with no backend (per docs/research/legacy-accounting-
// reality-2026-05-30.md). After the pivot the page now renders receipt
// history (tb_receipt) — so routing the INVOICE menu leaf at it was a
// label/destination mismatch. ภูม clicked "ใบแจ้งหนี้ → ฝากนำเข้า แบบเรทราคา"
// and landed on receipt history.
//
// FIX: invoice leaves fall through to the catch-all stub (legacy ใบแจ้งหนี้
// workflow doesn't exist in Pacred yet — bannered as "🚧 Wave 24+").
// The forwarder-invoice page is now routed FROM `receiptStatuses` below
// (where it truthfully belongs).
function invoiceStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => {
    const base = `/admin/accounting/cargo/income/${typeSlug}/${s.slug}`;
    return {
      label: s.label,
      href: base,
      children: [
        { label: "สร้าง",          href: `${base}/new` },
        { label: "รอชำระเงิน",     href: `${base}?status=awaiting_payment` },
        { label: "ชำระแล้ว",        href: `${base}?status=paid` },
        { label: "พ้นกำหนด",       href: `${base}?status=expired` },
        { label: "ดูทั้งหมด",       href: base },
      ],
    };
  });
}

// Used for receipt (3 statuses — สร้าง / ชำระแล้ว / ดูทั้งหมด — legacy
// has no pending state for receipts).
//
// ── 2026-05-31 sitting-H-fix (ภูม) — receipt leaves consolidate at /receipts ──
// All 4 service leaves now point at the new PEAK-style 7-tab list at
// `/admin/accounting/receipts` (the canonical ใบเสร็จรับเงิน landing).
// `/admin/accounting/forwarder-invoice` (the Wave 29 list) was demoted to a
// redirect → /receipts in the same commit; its [id] mPDF print page + /add
// manual-issue form stay live as canonical detail + create endpoints.
//
// Each service leaf carries its own `?service=` query (and `?kind=` for the
// ฝากนำเข้า เรท vs รายการ split — distinguishable via the existence of
// `tb_forwarder_item` children, confirmed 2026-05-31 schema audit). The
// server-side filter for ?service/?kind is staged for Phase H-fix 3 (next
// turn) — the URLs are wired now so the headmenu reflects the intent and
// the leaves work as bookmarks when the filter lands.
//
// "สร้าง" leaf points at the existing Wave 29 manual-issue form at
// /admin/accounting/forwarder-invoice/add (kept untouched in the redirect
// shuffle). Per AGENTS.md §0d every function ships its entry-point.
function receiptStatuses(): MenubarItem[] {
  const base = "/admin/accounting/receipts";
  const addPath = "/admin/accounting/forwarder-invoice/add";
  return SERVICES.map((s) => {
    // Service → URL param mapping.
    let serviceQs = "";
    switch (s.slug) {
      case "shop":            serviceQs = "?service=shop";                       break;
      case "forwarder-rate":  serviceQs = "?service=forwarder&kind=rate";        break;
      case "forwarder-item":  serviceQs = "?service=forwarder&kind=item";        break;
      case "payment":         serviceQs = "?service=payment";                    break;
    }
    return {
      label: s.label,
      href: `${base}${serviceQs}`,
      children: [
        { label: "สร้าง",       href: addPath },
        { label: "ชำระแล้ว",     href: `${base}${serviceQs}${serviceQs ? "&" : "?"}tab=issued` },
        { label: "ดูทั้งหมด",    href: `${base}${serviceQs}${serviceQs ? "&" : "?"}tab=all` },
      ],
    };
  });
}

// Used for credit-note / debit-note / billing-note (2 statuses — สร้าง / ดูทั้งหมด).
function notesStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",      href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}/new` },
      { label: "ดูทั้งหมด",   href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}` },
    ],
  }));
}

/**
 * The PEAK-style cargo accounting menubar. Use with:
 *
 *   <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting" />
 *
 * Wave 20 fix (2026-05-26): the canonical landing for "ระบบบัญชี" sidebar
 * is now `/admin/accounting` (dashboard with ฿ summaries). `/cargo`
 * redirects here. activeHref should be set per-page to highlight the
 * current section.
 */
export const CARGO_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/accounting" },
  {
    label: "รายรับ",
    children: [
      { label: "ดูภาพรวม",                              href: "/admin/accounting?view=overview" },
      { label: "ดูภาพรวม แบบตารางรายปี → เดือน",      href: "/admin/accounting?view=yearly" },
      // 2026-06-14 (เดฟ · dead-label removal · §0d no-dead-nav · §0b source-verified):
      // CARGO has NO ใบเสนอราคา (quotation) stage. The PEAK menubar this is
      // ported from (acc-system-cargo.php) renders ใบเสนอราคา as DECORATIVE
      // chrome with href="" — a dead label in legacy itself (verified:
      // include/pages/acc-system-cargo/pages/income/home.php:19 `href=""`;
      // the income dispatcher home.php:55 switch($subP) only handles
      // `receipt-forwarder-item`, so subP=quotation falls to the income
      // landing — no quotation handler file exists). Cargo's first money doc
      // is the ใบเสร็จ/ใบวางบิล (bill), NOT a quote (unlike FREIGHT, which
      // DOES have a real quote flow at /admin/accounting/freight/quotes —
      // kept untouched). In Pacred this leaf routed to the
      // .../income/quotation/* "🚧 กำลังพัฒนา" stub that can never be made
      // real → a dead end for staff. Removed (not stubbed) per §0d.
      // NOTE: ใบรับเงินมัดจำ (deposit) below is likewise legacy-decorative for
      // cargo, but kept this turn (the named scope was the quotation label).
      { label: "ใบรับเงินมัดจำ",                         children: quotationStatuses("deposit") },
      { label: "ใบแจ้งหนี้ (ใบส่งของ, บันทึกลูกหนี้)",     children: invoiceStatuses("invoice") },
      {
        label: "ใบเสร็จรับเงิน",
        href: "/admin/accounting/receipts",  // 2026-05-30 sitting-Phase-B: PEAK 7-tab landing (NEW)
        children: receiptStatuses(),
      },
      // 2026-05-31 sitting-H-fix #5 (ภูม): ใบกำกับภาษีขาย moved INTO รายรับ
      // (PEAK structure). Was an orphan sidebar entry via `blockExtTaxInvoices`
      // in `lib/admin/sidebar-menu.ts` — now removed from sidebar + surfaced
      // here as the proper accounting menubar leaf. Children map to existing
      // tax_invoices.status enum (rออนุมัติ / ออกแล้ว / ยกเลิก per migration
      // 0034 L47). NEXT PHASE: also add "ใบกำกับภาษีซื้อ" under "รายจ่าย"
      // (ภูม Q3 "phase ถัดไปก็ได้").
      {
        // 2026-06-09 — consolidated onto the live tb_* e-Tax hub. The old
        // /admin/tax-invoices read the 0-row World-A `tax_invoices` twin; real
        // issued ใบกำกับภาษี live in tb_forwarder_tax_invoice / tb_shop_tax_invoice
        // (both surfaced at /admin/accounting/etax). The dead-twin status tabs
        // (รออนุมัติ/ออกแล้ว/ยกเลิก) were on that twin, so they are dropped.
        label: "ใบกำกับภาษีขาย",
        href: "/admin/accounting/etax",
        children: [
          { label: "สร้าง (จากใบเสร็จ)", href: "/admin/accounting/receipts" }, // customer requests from /service-* — admin issues from row
          { label: "ออกแล้ว (e-Tax)",    href: "/admin/accounting/etax" },     // live tb_* — forwarder + shop/yuan lanes
        ],
      },
      // 2026-06-05 (ภูม D7 · CEO 3-tax-doc trio LAST LEG): ใบขนสินค้า
      // hub สำหรับ admin. Backend actions (V-E11) มาตั้งแต่ 2026 ต้น —
      // หน้านี้คือ admin nav แรกที่เข้าถึงได้ตรงๆ (เลิก orphan ตาม §0d).
      {
        label: "ใบขนสินค้า",
        href: "/admin/accounting/customs-declarations",
        children: [
          { label: "ดูทั้งหมด",     href: "/admin/accounting/customs-declarations" },
          { label: "ร่าง (Draft)",    href: "/admin/accounting/customs-declarations?status=draft" },
          { label: "ส่งแล้ว",         href: "/admin/accounting/customs-declarations?status=submitted" },
          { label: "ศุลฯ รับ",        href: "/admin/accounting/customs-declarations?status=accepted" },
          { label: "ปล่อยแล้ว",      href: "/admin/accounting/customs-declarations?status=released" },
          { label: "ยกเลิก",          href: "/admin/accounting/customs-declarations?status=cancelled" },
        ],
      },
      // 2026-06-09 (เดฟ · tax-invoice P3): ใบขนรวม CARGO — ฝากสั่งซื้อ/ฝากนำเข้า
      // = งาน Freight-LCL ที่ออกใบขนรวมใบเดียวในชื่อบริษัทขนส่ง. ใช้โมเดล
      // customs_declarations ตัวเดียวกับ Freight (bridge mig 0162). มูลค่าสำแดง
      // ตั้งจากต้นทุน (mig 0158) · Docs ปรับลด. P3 = capture/surface เท่านั้น.
      {
        label: "ใบขนรวม (CARGO)",
        href: "/admin/accounting/cargo-declarations",
      },
      { label: "ใบลดหนี้",                              children: notesStatuses("credit-note") },
      { label: "ใบเพิ่มหนี้",                            children: notesStatuses("debit-note") },
      // 2026-06-03 (R-2 · เดฟ): ใบวางบิล wired to the live billing-run port
      // (migration 0138 · tb_forwarder_invoice). Was stubbed via
      // notesStatuses("billing-note") → 404. Mirrors PEAK status tabs
      // ล่าสุด / ทั้งหมด / รอรับชำระ / เกินเวลา / รับชำระแล้ว / ยกเลิก.
      // ภูม flag 2026-06-03: ใบวางบิลเป็นของ "ระบบบัญชี" (PEAK pattern)
      // → ย้ายมาที่นี่ ทิ้งสตับ /accounting/cargo/income/billing-note/* เก่า.
      {
        label: "ใบวางบิล",
        href: "/admin/billing-run",
        children: [
          { label: "สร้างใบวางบิลใหม่",  href: "/admin/billing-run/add" },
          { label: "ล่าสุด (30 วัน)",     href: "/admin/billing-run?tab=recent" },
          { label: "ทั้งหมด",             href: "/admin/billing-run?tab=all" },
          { label: "รอรับชำระ",          href: "/admin/billing-run?tab=issued" },
          { label: "เกินเวลารับชำระ",    href: "/admin/billing-run?tab=overdue" },
          { label: "รับชำระแล้ว",        href: "/admin/billing-run?tab=paid" },
          { label: "ยกเลิก",              href: "/admin/billing-run?tab=cancelled" },
        ],
      },
      // 2026-06-03 (R-2 · เดฟ): รวมบิลสินค้า also belongs in รายรับ (legacy
      // ใบส่งสินค้า / shipping-bill family · adjacent to ใบวางบิล workflow).
      // ภูม flag: ย้ายมาจาก /admin/forwarders "งาน" dropdown.
      {
        label: "รวมบิลสินค้า (ใบส่งสินค้า)",
        href: "/admin/forwarders/combine-bill",
        children: [
          { label: "สร้างใบรวมบิล",   href: "/admin/forwarders/combine-bill/add" },
          { label: "ดูทั้งหมด",        href: "/admin/forwarders/combine-bill" },
        ],
      },
    ],
  },
  // 2026-07-09 (faithful-look · ภูม#1) — the "รายงานรับรู้รายได้ Cargo" group
  // (legacy menu-acc.php). Its 8 revenue-recognition report leaves were only
  // reachable as hub cards (hard to find — ภูม "ทางเข้าอยู่ไหน หาไม่เจอ") →
  // surfaced here as a top-menubar dropdown (≤2 clicks from the accounting hub),
  // mirroring the legacy sidebar group structure exactly.
  {
    label: "รายงานรับรู้รายได้",
    children: [
      { label: "รายรับ - รายจ่าย",   href: "/admin/accounting?view=overview" },
      { label: "รายการเติมเงิน",     href: "/admin/accounting/topup" },
      { label: "รายงานฝากสั่ง",      href: "/admin/accounting/shop" },
      {
        label: "ฝากนำเข้าสินค้า",
        href: "/admin/accounting/forwarder",
        children: [
          { label: "ใบแจ้งหนี้",     href: "/admin/accounting/receipts" },
          { label: "ประวัติใบเสร็จ", href: "/admin/accounting/receipts" },
          { label: "ยอดทั้งหมด",     href: "/admin/accounting/forwarder" },
        ],
      },
      { label: "ฝากชำระ/โอนหยวน",    href: "/admin/accounting/payment" },
      { label: "ถอนเงิน โอนโดยตรง",  href: "/admin/accounting/withdraw" },
      {
        label: "คืนเงินเข้า Wallet",
        href: "/admin/accounting/shop-refund",
        children: [
          { label: "คืนเงินฝากสั่ง",   href: "/admin/accounting/shop-refund" },
          { label: "คืนเงินฝากนำเข้า", href: "/admin/reports/refunds" },
        ],
      },
    ],
  },
  {
    label: "รายจ่าย",
    children: [
      // 2026-06-01 (re-sweep A2 #23): admin-PUSH shop-affiliate disbursement
      // — faithful port of report-shops-profit-pay.php. Selects paid shop
      // orders (tb_header_order) → batches into tb_shop_pay_h + sub → flips
      // hShopPay. The "เบิกจ่ายค่าสินค้า" (China-cost pay-out) leaf. §0d.
      { label: "เบิกจ่ายค่าสินค้า (ฝากสั่งซื้อ)", href: "/admin/shop-disbursement" },
      { label: "ประวัติเบิกจ่ายค่าสินค้า", href: "/admin/shop-disbursement/history" },
      // 2026-06-02 sitting-I-fix (ภูม flagged "ไม่มีทางเข้า nav"): batch payout
      // surfaces wired into PEAK รายจ่าย topic (matches PEAK pattern where
      // withdrawals = expense). Each leaf shows the historical 25 sale + 46
      // interpreter batches surfaced 2026-06-02 by commit 101e75dc.
      { label: "เบิกค่าคอม Sales (batch รายเดือน)",  href: "/admin/accounting/withdraw/comm-sale" },
      { label: "เบิกค่าคอมล่าม (batch รายเดือน)",   href: "/admin/accounting/withdraw/comm-interpreter" },
      // 2026-07-01 (spec docs/research/accounting-ap-2026-07-01 · mig 0239):
      // the first-class AP / เบิกจ่าย ledger — the general per-shipment service
      // disbursement (เบิกเงิน) row + the กองกลางโกดังจีน ¥ float. Slice 1 = READ
      // + request/approve record only (no money-out pay-flip yet). §0d.
      { label: "AP / เบิกจ่าย (Ledger)", href: "/admin/accounting/ap" },
      { label: "กองกลางโกดังจีน (¥ float)", href: "/admin/accounting/ap/central-fund" },
      // TODO — legacy `acc-system-cargo.php` (header-menu/index.php L204-363):
      // ดูภาพรวม / ใบสั่งซื้อ / ใบจ่ายเงินมัดจำ / บันทึกค่าใช้จ่าย / ใบกำกับ
      // ภาษีซื้อ / รับใบลดหนี้ / รับใบเพิ่มหนี้ / นำเข้าเอกสาร.
      // Wave 23 P0 (2026-05-27): href → catch-all stub (was "#" → no-op click).
      { label: "🚧 อยู่ระหว่างพัฒนา (Wave 24+)", href: "/admin/accounting/cargo/income/expenses/coming-soon" },
    ],
  },
  {
    label: "ผู้ติดต่อ",
    children: [
      // TODO — legacy L364-423: ดูภาพรวม / ลูกค้า (ค้นหา / บุคคลธรรมดา / นิติบุคคล / SVIP / VIP / เครดิต / ค่าเทียบ / ดูทั้งหมด).
      { label: "🚧 อยู่ระหว่างพัฒนา (Wave 24+)", href: "/admin/accounting/cargo/income/contacts/coming-soon" },
    ],
  },
  {
    label: "การเงิน",
    children: [
      // owner 2026-06-28 — กระดานสถานะการชำระเงินลูกค้า (ใครจ่าย/ยังไม่จ่าย · ขาย-ต้นทุน · เงินสด/เครดิต · รถเรือแอร์ · admin).
      { label: "กระดานสถานะการชำระเงิน", href: "/admin/accounting/payment-board" },
      { label: "ลูกหนี้ค้างชำระ (AR Aging)", href: "/admin/accounting/ar-aging" },
      // TODO — legacy L424-495: ดูภาพรวม / เงินสด-ธนาคาร-eWallet / เช็ครับ / เช็คจ่าย / สำรองรับจ่าย / ภาษีถูกหัก / ภาษีหัก / โอนเงิน.
      { label: "🚧 อยู่ระหว่างพัฒนา (Wave 24+)", href: "/admin/accounting/cargo/income/finance/coming-soon" },
    ],
  },
  {
    label: "การบัญชี",
    children: [
      // 2026-06-02 sitting-I-fix (ภูม flagged "ไม่มีทางเข้า nav"): PEAK module
      // surfaces wired into PEAK การบัญชี topic. Pages shipped sitting-I
      // (commits afa15f1c + 5b6cbc0a).
      { label: "เอกสารบัญชี (Lifecycle)",      href: "/admin/accounting/documents" },
      // owner 2026-06-25 (HIST) — unified ประวัติออกเอกสารทั้งหมด (ใบเสร็จ/บิล/ใบกำกับ).
      { label: "ประวัติออกเอกสาร",            href: "/admin/accounting/document-history" },
      { label: "ลูกหนี้ค้างชำระ (AR Aging)",   href: "/admin/accounting/ar-aging" },
      // 2026-06-02 sitting-I §3.5 (ภูม poom-wave brief): PEAK/FlowAccount
      // CSV export hub — 4 datasets (receipts · bills · sale/interp comm batches).
      { label: "ส่งออก CSV (PEAK/FlowAccount)", href: "/admin/accounting/peak-export" },
      // 2026-06-02 sitting-I §3.4 (ภูม poom-wave brief): e-Tax (RD Code 86) hub.
      // Lists issued tb_forwarder_tax_invoice + XML/CSV download · MVP preview
      // shape (full XAdES-BES sig + RD-API submit DEFERRED).
      { label: "ส่งออก e-Tax (RD Code 86)",     href: "/admin/accounting/etax" },
      // 2026-06-02 sitting-I §3.4 Phase-C: 50-ทวิ cert tracking · juristic
      // customers withhold + send cert · admin marks received / waived.
      { label: "ติดตาม 50-ทวิ (WHT certs)",      href: "/admin/accounting/wht-certs" },
      // 2026-06-04 (reachability audit §0d): the older WHT chase queue (ADR-0015 ·
      // withholding_tax_entries table · per-shipment/tax-invoice WHT roll-up).
      // Was orphan (no inbound link · URL-only). Distinct from "WHT certs" above
      // (which reads the sitting-I tb_forwarder_tax_invoice queue) — kept adjacent
      // so accounting sees both 50-ทวิ surfaces. Page gates super/accounting.
      { label: "คุมยอดภาษีหัก ณ ที่จ่าย (WHT chase)", href: "/admin/wht" },
      // 2026-06-02 sitting-I · CEO directive 2026-06-01: profit-cap ≤ 15k/ตู้
      // retrospective monitor (forward quote-comparison tool = next surface).
      { label: "Margin Monitor (CEO ≤ ฿15k cap)", href: "/admin/accounting/margin-monitor" },
      // 2026-06-05 (ภูม) — Near-churn customer report (CEO automation lane ·
      // "business runs itself"): inactive customers ranked by lifetime margin
      // = the highest-LTV win-back targets.
      { label: "ลูกค้าใกล้หายไป (Near-Churn)", href: "/admin/accounting/near-churn" },
      // 2026-06-02 sitting-I · CEO directive 2026-06-01: forward-looking pair
      // to Margin Monitor — sales reps compare 9 carriers' projected margin
      // BEFORE pitching, route via best carrier per CEO cap policy.
      { label: "Sales Quote Comparison",  href: "/admin/accounting/quote-compare" },
      // Lane C 2026-06-04 (global-trade-group §5): the รถ/เรือ/แอร์ side-by-side
      // compare (+ add-on services + per-route min-sell floor + CEO cap). Pair
      // of quote-compare (which is per-carrier within one mode).
      { label: "เทียบ รถ/เรือ/แอร์ (+ ค่าบริการ)", href: "/admin/accounting/quote-compare/modes" },
      // Wave 7.3 (2026-05-22): wired 2 orphan accounting pages here per
      // ภูม decision in page-inventory-2026-05-21-night.md §🔴 DEAD.
      { label: "งวดบัญชี",  href: "/admin/accounting/periods" },
      { label: "กระทบยอด", href: "/admin/accounting/reconcile" },
      // 2026-06-04 (reachability audit §0d): slip↔order payment reconciliation
      // (V-A3 · the OTHER side of กระทบยอด — matches completed deposit wallet_tx
      // to pending forwarders / routes to refund queue · its own docstring names
      // /admin/accounting/reconcile as companion). Was orphan (no inbound link ·
      // URL-only). Page gates accounting.
      { label: "จับคู่สลิป↔ออเดอร์ (Reconciliation)", href: "/admin/payment-reconciliation" },
      // TODO — legacy L496-597: ผังบัญชี / บัญชีรายวัน / บัญชีแยกประเภท / งบทดลอง / งบฐานะ / งบกำไรขาดทุน / งบกระแสเงินสด / DBD e-Filing / สินทรัพย์.
      // Wave 23 P0 (2026-05-27): stub instead of no-op "#".
      { label: "🚧 อยู่ระหว่างพัฒนา (Wave 24+)", href: "/admin/accounting/cargo/income/ledger/coming-soon" },
    ],
  },
];

/**
 * Quick-access cards shown below the menubar — links to the
 * accounting sub-pages that ARE live today. Sequence ordered by daily-
 * usage frequency: ledger reports → disbursements → month-end →
 * invoice generation.
 */
export const ACCOUNTING_HUB_CARDS = [
  // owner 2026-06-28 — กระดานสถานะการชำระเงิน: ใครจ่าย/ยังไม่จ่าย at-a-glance.
  {
    title: "กระดานสถานะการชำระเงิน",
    desc: "ใครจ่ายแล้ว/ยังไม่จ่าย · ยอดค้าง · ขาย-ต้นทุน · เงินสด/เครดิต · รถ/เรือ/แอร์ · เซลล์ดูแล · ค้นหา+แก้ไข",
    href: "/admin/accounting/payment-board",
    badge: "ใหม่",
  },
  // 2026-05-30 sitting-Phase-B (ภูม) — PEAK-style ใบเสร็จ explorer landed.
  // Placed FIRST because new daily-driver for accounting staff per owner
  // brief (matches PEAK accounting UI patterns).
  {
    title: "ใบเสร็จรับเงิน (PEAK style)",
    desc: "7-tab nav · ล่าสุด/รอชำระ/ออกแล้ว/ยกเลิก · default current month",
    href: "/admin/accounting/receipts",
    badge: "live",
  },
  // 2026-06-05 (ภูม D7) — ใบขนสินค้า admin hub · CEO 3-tax-doc trio last leg.
  // Backend ใส่ตั้งแต่ V-E11 ต้นปี · หน้านี้ surface admin discovery
  // (เคยเป็น orphan · 0 inbound link). MVP read-only · mutate UI ตามมา
  // หลัง accounting sign-off VAT-base policy.
  {
    title: "ใบขนสินค้า (Customs Declaration)",
    desc: "Status: ร่าง→ส่ง→รับ→ปล่อย ↘ ยกเลิก · PDF download · CEO 3-tax-doc trio",
    href: "/admin/accounting/customs-declarations",
    badge: "live",
  },
  // 2026-06-02 (poom-wave §4 · ภูม) — AR-aging cockpit · ลูกหนี้ค้างชำระ
  // bucketed 0-30/30-60/60-90/90+ days. Surfaces ~457 outstanding rows
  // for collection-team follow-up.
  {
    title: "ลูกหนี้ค้างชำระ (AR Aging)",
    desc: "Bucket 0-30/30-60/60-90/90+ วัน · top customers + rep attribution",
    href: "/admin/accounting/ar-aging",
    badge: "live",
  },
  // 2026-06-02 (poom-wave §3.1 · ภูม) — PEAK documents lifecycle hub
  {
    title: "เอกสารบัญชี (Lifecycle)",
    desc: "ใบเสนอราคา→ใบแจ้งหนี้→ใบเสร็จ→ใบกำกับ→ใบลด/เพิ่มหนี้ · stats เดือนปัจจุบัน",
    href: "/admin/accounting/documents",
    badge: "live",
  },
  {
    title: "ฝากนำเข้า (รายงานบัญชี)",
    desc: "Report 1:1 ของ acc-forwarder.php — ledger ฝากนำเข้าที่ชำระแล้ว",
    href: "/admin/accounting/forwarder",
    badge: "live",
  },
  {
    title: "ฝากสั่งซื้อสินค้า (รายงานบัญชี)",
    desc: "Report 1:1 ของ acc-shop.php — ledger ฝากสั่งที่สำเร็จ",
    href: "/admin/accounting/shop",
    badge: "live",
  },
  // 2026-06-15 (§0d · เดฟ) — the 3rd acc-*.php sibling. Was a faithful 1:1 port
  // of acc-payment.php (ledger รายได้ฝากโอนหยวน · live tb_wallet_hs+tb_payment
  // type=6 payStatus=2) but orphaned (URL-only, no menu). Wired next to its two
  // siblings. Distinct from /admin/yuan-payments (ops queue) + reports/yuan-profit
  // (reads the rebuilt yuan_payments twin) — this is the live-data accounting ledger.
  {
    title: "ฝากโอนหยวน (รายงานบัญชี)",
    desc: "Report 1:1 ของ acc-payment.php — ledger รายได้ฝากโอนหยวนที่สำเร็จ (margin ต่อรายการ)",
    href: "/admin/accounting/payment",
    badge: "live",
  },
  // 2026-07-09 (§0d · faithful-look recon · ภูม#1) — the 4th "รายงานรับรู้รายได้
  // Cargo" sibling (menu-acc.php L20). Was a faithful 1:1 port of acc-withdraw.php
  // (ledger ถอนเงิน/โอนคืน · live tb_wallet_hs) but orphaned — reachable by URL
  // only, no card next to shop/forwarder/payment. Wired here to close the group.
  {
    title: "ถอนเงิน โอนโดยตรง (รายงานบัญชี)",
    desc: "Report 1:1 ของ acc-withdraw.php — ledger การถอน/โอนคืนเงินลูกค้าโดยตรง",
    href: "/admin/accounting/withdraw",
    badge: "live",
  },
  // 2026-07-09 (faithful-look build · ภูม#1) — the 2 remaining "รายงานรับรู้
  // รายได้ Cargo" siblings (menu-acc.php L10 + L23): รายการเติมเงิน (acc-topup.php
  // · tb_wallet_hs approved slips) + คืนเงินฝากสั่ง (acc-shop-refund.php ·
  // tb_wallet_hs type=5 refund → order join). Read-only ledger reports.
  {
    title: "รายการเติมเงิน (รายงานบัญชี)",
    desc: "Report 1:1 ของ acc-topup.php — รายการเติมเงินที่อนุมัติแล้ว (มีสลิป)",
    href: "/admin/accounting/topup",
    badge: "live",
  },
  {
    title: "คืนเงินฝากสั่ง (รายงานบัญชี)",
    desc: "Report 1:1 ของ acc-shop-refund.php — เงินคืนฝากสั่งเข้า Wallet",
    href: "/admin/accounting/shop-refund",
    badge: "live",
  },
  {
    title: "ใบลด/ใบจ่าย (Disbursements)",
    desc: "ใบเบิกจ่าย + เบิกเงิน",
    href: "/admin/accounting/disbursements",
    badge: "live",
  },
  // 2026-06-03 (R-2 · เดฟ) — ใบวางบิล / billing-run (NEW · migration 0138).
  // ใบเรียกเก็บค่าฝากนำเข้าให้ลูกค้าเครดิตเทอม. PEAK pattern: lives in
  // ระบบบัญชี (not ฝากนำเข้า) — ภูม flag 2026-06-03.
  {
    title: "ใบวางบิล (Billing-Run)",
    desc: "ใบเรียกเก็บลูกค้าเครดิตเทอม · ฝากนำเข้า fStatus=5 · PEAK tabs",
    href: "/admin/billing-run",
    badge: "live",
  },
  // 2026-06-03 (R-2 · เดฟ) — รวมบิลสินค้า (ใบส่งสินค้า) ย้ายมาจาก /admin/forwarders.
  {
    title: "รวมบิลสินค้า (ใบส่งสินค้า)",
    desc: "รวมหลายรายการของลูกค้าเดียวกัน → ใบส่งสินค้าใบเดียว · พิมพ์ตามคนขับ",
    href: "/admin/forwarders/combine-bill",
    badge: "live",
  },
  // 2026-06-01 (re-sweep A2 #23): admin-PUSH shop-affiliate disbursement.
  {
    title: "เบิกจ่ายค่าสินค้า (ฝากสั่งซื้อ)",
    desc: "ทำรายการเบิกเงินจ่ายต้นทุนจีน · ออเดอร์ฝากสั่งที่ชำระแล้ว → tb_shop_pay_h",
    href: "/admin/shop-disbursement",
    badge: "live",
  },
  {
    title: "ปิดงบรายเดือน",
    desc: "ปิดงบฝากนำเข้ารายเดือน",
    href: "/admin/accounting/closing",
    badge: "live",
  },
  // 2026-05-31 sitting-H-fix: removed duplicate "Forwarder Receipt" card.
  // /admin/accounting/forwarder-invoice now redirects to /admin/accounting/
  // receipts (the new PEAK 7-tab list) — having both as separate cards on the
  // hub landing was confusing duplicate UX. The "ใบเสร็จรับเงิน (PEAK style)"
  // card above is the single canonical entry point.
  {
    title: "งวดบัญชี + กระทบยอด",
    desc: "งวดบัญชี · กระทบยอดประจำเดือน",
    href: "/admin/accounting/periods",
    badge: "live",
  },
] as const;
