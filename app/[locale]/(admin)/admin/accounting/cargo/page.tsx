import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { AccountingSegmentPills } from "@/components/admin/accounting-segment-pills";

/**
 * Admin > ระบบบัญชี Cargo (hub)
 *
 * Hosts the cargo-accounting TOP menubar (modelled on legacy
 * `acc-system-cargo.php` — purple gradient bar, 3-level cascading
 * dropdowns) above a simple card-grid hub. The menubar's leaf URLs
 * point at quotation / deposit / invoice / receipt / etc. sub-pages —
 * many of which don't exist as routes yet (they 404 by virtue of not
 * existing, per ภูม's approved Q3). Future agents fill out the leaves.
 *
 * The body below the menubar is the "หน้าหลัก" default view: a card
 * grid linking to the existing accounting sub-pages that ARE live
 * (`/accounting`, `/accounting/forwarder`, `/accounting/shop`,
 * `/accounting/disbursements`, etc.) so the page is useful immediately
 * while the cascade leaves get built.
 *
 * Owner brief 2026-05-20 night: Pacred sidebar is too crowded — pushing
 * accounting depth into a TOP menubar (legacy pattern) frees the
 * sidebar for high-level navigation only.
 */

// ── Menubar config — transcribed from legacy header-menu/index.php ──────────

// Per-service status leaves common to ใบเสนอราคา / ใบรับเงินมัดจำ /
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
function invoiceStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",          href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}/new` },
      { label: "รอชำระเงิน",     href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}?status=awaiting_payment` },
      { label: "ชำระแล้ว",        href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}?status=paid` },
      { label: "พ้นกำหนด",       href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}?status=expired` },
      { label: "ดูทั้งหมด",       href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}` },
    ],
  }));
}

// Used for receipt (3 statuses — สร้าง / ชำระแล้ว / ดูทั้งหมด — legacy
// has no pending state for receipts).
function receiptStatuses(typeSlug: string): MenubarItem[] {
  return SERVICES.map((s) => ({
    label: s.label,
    children: [
      { label: "สร้าง",      href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}/new` },
      { label: "ชำระแล้ว",    href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}?status=paid` },
      { label: "ดูทั้งหมด",   href: `/admin/accounting/cargo/income/${typeSlug}/${s.slug}` },
    ],
  }));
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

const CARGO_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/accounting/cargo" },
  {
    label: "รายรับ",
    children: [
      { label: "ดูภาพรวม",                              href: "/admin/accounting/cargo?view=overview" },
      { label: "ดูภาพรวม แบบตารางรายปี → เดือน",      href: "/admin/accounting/cargo?view=yearly" },
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
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
  {
    label: "ผู้ติดต่อ",
    children: [
      // TODO — legacy L364-423: ดูภาพรวม / ลูกค้า (ค้นหา / บุคคลธรรมดา / นิติบุคคล / SVIP / VIP / เครดิต / ค่าเทียบ / ดูทั้งหมด).
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
  {
    label: "การเงิน",
    children: [
      // TODO — legacy L424-495: ดูภาพรวม / เงินสด-ธนาคาร-eWallet / เช็ครับ / เช็คจ่าย / สำรองรับจ่าย / ภาษีถูกหัก / ภาษีหัก / โอนเงิน.
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
  {
    label: "การบัญชี",
    children: [
      // TODO — legacy L496-597: ผังบัญชี / บัญชีรายวัน / บัญชีแยกประเภท / งบทดลอง / งบฐานะ / งบกำไรขาดทุน / งบกระแสเงินสด / DBD e-Filing / สินทรัพย์.
      { label: "อยู่ระหว่างพัฒนา", href: "#" },
    ],
  },
];

// ── Hub body — links to existing accounting sub-pages ──────────────────────

const HUB_CARDS = [
  {
    title: "บัญชีรวม (Tabbed)",
    desc: "Dashboard เดิม — รายรับสุทธิ + pipeline + breakdown 6 ประเภท",
    href: "/admin/accounting",
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
    title: "Forwarder Invoice",
    desc: "ใบกำกับภาษีฝากนำเข้า",
    href: "/admin/accounting/forwarder-invoice",
    badge: "live",
  },
];

// ── Page ────────────────────────────────────────────────────────────────────

export default async function AdminAccountingCargoHubPage() {
  // Same role gate as /admin/accounting — accounting-only (revenue +
  // financial rows surface).
  await requireAdmin(["accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">ระบบบัญชี</h1>
          {/* 2026-05-21 ภูม brief — sidebar dropdown removed; Cargo/Freight
              split moved here as a Segmented Control (mirrors the
              /admin/forwarders pattern). */}
          <AccountingSegmentPills active="cargo" />
        </div>
        <p className="mt-2 text-sm text-muted">
          Cargo · ฝากสั่งซื้อ · ฝากนำเข้า · ฝากโอนหยวน — รายรับ · รายจ่าย · ผู้ติดต่อ · การเงิน · การบัญชี
        </p>
      </div>

      {/* TOP menubar — legacy purple bar with cascading dropdowns */}
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/cargo" />

      {/* Hub body — quick-access cards to the live accounting sub-pages */}
      <section>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">
          เข้าใช้งานเร็ว — หน้าบัญชีที่ใช้ได้ตอนนี้
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
                <span className="rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[10px] font-medium uppercase">
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
        เมนูด้านบน (รายรับ / รายจ่าย / ผู้ติดต่อ / การเงิน / การบัญชี) เป็นโครงเดียวกับ
        legacy <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">acc-system-cargo.php</code> —
        บางลิงก์ปลายทางยังเป็น placeholder (รอสร้างหน้าจริง)
      </p>
    </main>
  );
}
