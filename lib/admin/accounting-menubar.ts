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
// ── 2026-05-30 ภูม flagged #7 (ROUTING FIX) ──
// The "ใบเสร็จรับเงิน → ฝากนำเข้า แบบเรทราคา / ฝากนำเข้า แบบรายการ" leaves
// now route at the REAL Pacred page /admin/accounting/forwarder-invoice
// (the tb_receipt-backed list + add/print page · Wave 29 pivot · the only
// working accounting doc-flow in Pacred today). Was previously routing
// from the INVOICE leaf which was misleading. Other (type,service) combos
// still fall through to the catch-all "🚧 Wave 24+" stub.
function receiptStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => {
    const isForwarderReceipt =
      typeSlug === "receipt" && (s.slug === "forwarder-rate" || s.slug === "forwarder-item");
    const base = isForwarderReceipt
      ? "/admin/accounting/forwarder-invoice"
      : `/admin/accounting/cargo/income/${typeSlug}/${s.slug}`;
    const newPath = isForwarderReceipt ? `${base}/add` : `${base}/new`;
    return {
      label: s.label,
      href: base,
      children: [
        { label: "สร้าง",      href: newPath },
        { label: "ชำระแล้ว",    href: `${base}?status=paid` },
        { label: "ดูทั้งหมด",   href: base },
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
      { label: "ใบเสนอราคา",                            children: quotationStatuses("quotation") },
      { label: "ใบรับเงินมัดจำ",                         children: quotationStatuses("deposit") },
      { label: "ใบแจ้งหนี้ (ใบส่งของ, บันทึกลูกหนี้)",     children: invoiceStatuses("invoice") },
      { label: "ใบเสร็จรับเงิน",                          children: receiptStatuses("receipt") },
      { label: "ใบลดหนี้",                              children: notesStatuses("credit-note") },
      { label: "ใบเพิ่มหนี้",                            children: notesStatuses("debit-note") },
      { label: "ใบวางบิล",                              children: notesStatuses("billing-note") },
    ],
  },
  {
    label: "รายจ่าย",
    children: [
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
      // TODO — legacy L424-495: ดูภาพรวม / เงินสด-ธนาคาร-eWallet / เช็ครับ / เช็คจ่าย / สำรองรับจ่าย / ภาษีถูกหัก / ภาษีหัก / โอนเงิน.
      { label: "🚧 อยู่ระหว่างพัฒนา (Wave 24+)", href: "/admin/accounting/cargo/income/finance/coming-soon" },
    ],
  },
  {
    label: "การบัญชี",
    children: [
      // Wave 7.3 (2026-05-22): wired 2 orphan accounting pages here per
      // ภูม decision in page-inventory-2026-05-21-night.md §🔴 DEAD.
      { label: "งวดบัญชี",  href: "/admin/accounting/periods" },
      { label: "กระทบยอด", href: "/admin/accounting/reconcile" },
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
  {
    title: "ใบลด/ใบจ่าย (Disbursements)",
    desc: "ใบเบิกจ่าย + เบิกเงิน",
    href: "/admin/accounting/disbursements",
    badge: "live",
  },
  {
    title: "ปิดงบรายเดือน",
    desc: "ปิดงบฝากนำเข้ารายเดือน",
    href: "/admin/accounting/closing",
    badge: "live",
  },
  {
    // 2026-05-30 ภูม flagged #7: was titled "Forwarder Invoice / ใบกำกับภาษี
    // ฝากนำเข้า". The destination renders RECEIPT history (Wave 29 pivot —
    // tb_receipt-backed). Relabelled to "Forwarder Receipt / ประวัติใบเสร็จ
    // ฝากนำเข้า" so the card truthfully describes the page.
    title: "Forwarder Receipt",
    desc: "ประวัติใบเสร็จฝากนำเข้า",
    href: "/admin/accounting/forwarder-invoice",
    badge: "live",
  },
  {
    title: "งวดบัญชี + กระทบยอด",
    desc: "งวดบัญชี · กระทบยอดประจำเดือน",
    href: "/admin/accounting/periods",
    badge: "live",
  },
] as const;
