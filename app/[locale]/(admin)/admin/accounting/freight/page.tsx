import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { AccountingSegmentPills } from "@/components/admin/accounting-segment-pills";

/**
 * Admin > ระบบบัญชี Freight (hub)
 *
 * Sister page of `/admin/accounting/cargo` — same TOP-menubar pattern
 * (purple gradient bar · 3-level cascading dropdowns) but for the
 * Freight side of Pacred's service catalogue (FCL · LCL · customs
 * clearance · declaration · fumigation · export).
 *
 * Important: legacy PCS has **no** `acc-system-freight.php` — Pacred's
 * freight stack is new (the legacy was cargo-only). So this menubar is
 * a Pacred-original Phase-C construction modelled on the cargo legacy
 * pattern, with the services-axis swapped to the freight catalogue per
 * CLAUDE.md "Pacred Ecosystem" section. The menubar shape (รายรับ /
 * รายจ่าย / ผู้ติดต่อ / การเงิน / การบัญชี + 9 invoice types under
 * รายรับ) is preserved 1:1 with cargo for staff consistency.
 *
 * Many leaves 404 by virtue of not existing yet — the hub-body cards
 * below cover the freight sub-pages that ARE live today
 * (/admin/freight/quotes, /declarations, /shipments, /tax-invoices)
 * so the page is useful while future agents fill the cascade leaves.
 */

// ── Menubar config — freight services axis (Pacred-original) ────────────────

// Freight services per CLAUDE.md "Pacred Ecosystem" service catalogue —
// slugs mirror the existing /services/<slug> + /admin/freight/* trees.
// 6 services (cargo has 4) — gives us a wider but shallower menubar.
type Svc = { label: string; slug: string };
const SERVICES: Svc[] = [
  { label: "ฝากนำเข้า FCL",          slug: "fcl" },
  { label: "ฝากนำเข้า LCL",          slug: "lcl" },
  { label: "เคลียร์สินค้าติดด่าน",     slug: "clearance" },
  { label: "ออกใบขนสินค้า",          slug: "declaration" },
  { label: "ฟูมิเกชัน",               slug: "fumigation" },
  { label: "ส่งออก",                  slug: "export" },
];

// Used for quotation / deposit (5 statuses incl. "สร้าง").
function quotationStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",      href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}/new` },
      { label: "รอตอบรับ",   href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}?status=pending` },
      { label: "ยอมรับ",     href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}?status=accepted` },
      { label: "พ้นกำหนด",   href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}?status=expired` },
      { label: "ดูทั้งหมด",   href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}` },
    ],
  }));
}

// Used for invoice (5 statuses — รอชำระเงิน / ชำระแล้ว / พ้นกำหนด — payments flavour).
function invoiceStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",          href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}/new` },
      { label: "รอชำระเงิน",     href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}?status=awaiting_payment` },
      { label: "ชำระแล้ว",        href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}?status=paid` },
      { label: "พ้นกำหนด",       href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}?status=expired` },
      { label: "ดูทั้งหมด",       href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}` },
    ],
  }));
}

// Used for receipt (3 statuses — สร้าง / ชำระแล้ว / ดูทั้งหมด — legacy
// pattern has no pending state for receipts).
function receiptStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",      href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}/new` },
      { label: "ชำระแล้ว",    href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}?status=paid` },
      { label: "ดูทั้งหมด",   href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}` },
    ],
  }));
}

// Used for credit-note / debit-note / billing-note (2 statuses — สร้าง / ดูทั้งหมด).
function notesStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",      href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}/new` },
      { label: "ดูทั้งหมด",   href: `/admin/accounting/freight/income/${typeSlug}/${s.slug}` },
    ],
  }));
}

const FREIGHT_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/accounting/freight" },
  {
    label: "รายรับ",
    children: [
      { label: "ดูภาพรวม",                              href: "/admin/accounting/freight?view=overview" },
      { label: "ดูภาพรวม แบบตารางรายปี → เดือน",      href: "/admin/accounting/freight?view=yearly" },
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
      // TODO (Phase C) — mirror cargo: ดูภาพรวม / ใบสั่งซื้อ / ใบจ่ายเงินมัดจำ /
      // บันทึกค่าใช้จ่าย / ใบกำกับภาษีซื้อ / รับใบลดหนี้ / รับใบเพิ่มหนี้ /
      // นำเข้าเอกสาร — keyed by freight service-axis (FCL / LCL / clearance / ...).
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
  {
    label: "ผู้ติดต่อ",
    children: [
      // TODO (Phase C) — ดูภาพรวม / ลูกค้า (ค้นหา / บุคคลธรรมดา / นิติบุคคล /
      // SVIP / VIP / เครดิต / ค่าเทียบ / ดูทั้งหมด) + freight-specific:
      // ตัวแทนออกของ (customs broker) · forwarder agents · shipping lines.
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
  {
    label: "การเงิน",
    children: [
      // TODO (Phase C) — ดูภาพรวม / เงินสด-ธนาคาร-eWallet / เช็ครับ / เช็คจ่าย /
      // สำรองรับจ่าย / ภาษีถูกหัก / ภาษีหัก / โอนเงิน — shared with cargo
      // but reports filtered to freight orders only.
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
  {
    label: "การบัญชี",
    children: [
      // TODO (Phase C) — ผังบัญชี / บัญชีรายวัน / บัญชีแยกประเภท / งบทดลอง /
      // งบฐานะ / งบกำไรขาดทุน / งบกระแสเงินสด / DBD e-Filing / สินทรัพย์ —
      // freight P&L slice.
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
];

// ── Hub body — links to existing Pacred freight sub-pages ──────────────────

const HUB_CARDS = [
  {
    title: "ใบเสนอราคา (Freight Quotes)",
    desc: "ใบเสนอราคาฝั่งฟอร์เวอร์เดอร์ — สร้าง / ค้นหา / จัดการสถานะ",
    href: "/admin/freight/quotes",
    badge: "live",
  },
  {
    title: "ใบขนสินค้า (Declarations)",
    desc: "ใบขนสินค้าศุลกากร — ผูกกับ shipment + ส่งกรมศุล",
    href: "/admin/freight/declarations",
    badge: "live",
  },
  {
    title: "การขนส่ง (Shipments)",
    desc: "FCL / LCL shipments + value blocks + tracking",
    href: "/admin/freight/shipments",
    badge: "live",
  },
  {
    title: "ใบกำกับภาษี (Tax Invoices)",
    desc: "ใบกำกับภาษีรวม — Freight + Cargo (RD Code 86)",
    href: "/admin/tax-invoices",
    badge: "live",
  },
  {
    title: "บัญชีรวม (Tabbed)",
    desc: "Dashboard เดิม — รายรับสุทธิ + pipeline ทั้งระบบ",
    href: "/admin/accounting",
    badge: "live",
  },
  {
    title: "ระบบบัญชี Cargo",
    desc: "เมนูบัญชีฝั่ง Cargo (ฝากสั่งซื้อ / ฝากนำเข้า / ฝากโอนหยวน)",
    href: "/admin/accounting/cargo",
    badge: "sister",
  },
];

// Force-dynamic — auth gate reads cookies + body links query-string views.
export const dynamic = "force-dynamic";

// ── Page ────────────────────────────────────────────────────────────────────

export default async function AdminAccountingFreightHubPage() {
  // Match brief: super + accounting roles can access (helper auto-includes
  // super, but listing both explicitly documents intent).
  await requireAdmin(["super", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">ระบบบัญชี</h1>
          {/* 2026-05-21 ภูม brief — sidebar dropdown removed; Cargo/Freight
              split moved here as a Segmented Control (mirrors the
              /admin/forwarders pattern). */}
          <AccountingSegmentPills active="freight" />
        </div>
        <p className="mt-2 text-sm text-muted">
          Freight · FCL · LCL · เคลียร์ศุลกากร · ใบขนสินค้า · ฟูมิเกชัน · ส่งออก —
          รายรับ · รายจ่าย · ผู้ติดต่อ · การเงิน · การบัญชี
        </p>
      </div>

      {/* TOP menubar — purple bar with cascading dropdowns (sister of cargo) */}
      <PageTopMenubar items={FREIGHT_MENUBAR} activeHref="/admin/accounting/freight" />

      {/* Hub body — quick-access cards to the live freight sub-pages */}
      <section>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">
          เข้าใช้งานเร็ว — หน้าฟรายต์ที่ใช้ได้ตอนนี้
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HUB_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm hover:shadow-md hover:border-primary-300 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{card.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase border ${
                    card.badge === "live"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-indigo-50 text-indigo-700 border-indigo-200"
                  }`}
                >
                  {card.badge}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted leading-relaxed">{card.desc}</p>
              <p className="mt-3 text-xs font-medium text-primary-600">เปิด →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Note about the menubar */}
      <p className="text-xs text-muted italic">
        เมนูด้านบน (รายรับ / รายจ่าย / ผู้ติดต่อ / การเงิน / การบัญชี) ใช้รูปแบบเดียวกับ
        legacy <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">acc-system-cargo.php</code>{" "}
        — Freight ใหม่ใน Pacred (legacy ไม่มีฝั่งนี้) บางลิงก์ปลายทางยังเป็น placeholder (รอสร้างหน้าจริง)
      </p>
    </main>
  );
}
